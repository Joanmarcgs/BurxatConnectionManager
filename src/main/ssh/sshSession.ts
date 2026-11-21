import ssh2, { type Client as ClientType, type ClientChannel, type ConnectConfig } from 'ssh2'
import { readFileSync } from 'fs'
import net from 'net'
import type { Duplex } from 'stream'
import { getPageantAgent } from './pageantAgent'
import type { ConnectionConfig, PortForward } from '../../shared/types'

const { Client } = ssh2

export type SshDataListener = (chunk: Buffer) => void
export type SshCloseListener = (err?: Error) => void

export class SshSession {
  readonly id: string
  private client = new Client()
  private shellStream: ClientChannel | null = null
  private dataListeners = new Set<SshDataListener>()
  private closeListeners = new Set<SshCloseListener>()
  private jumpClients: ClientType[] = []
  private tunnelServers: net.Server[] = []

  constructor(id: string) {
    this.id = id
  }

  onData(listener: SshDataListener): void {
    this.dataListeners.add(listener)
  }

  onClose(listener: SshCloseListener): void {
    this.closeListeners.add(listener)
  }

  getClient(): ClientType {
    return this.client
  }

  /** Translates a connection's saved auth settings into ssh2's connect options. Throws on a bad setup. */
  private buildConnectConfig(config: ConnectionConfig): ConnectConfig {
    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      readyTimeout: 20000,
      keepaliveInterval: 15000
    }

    if (config.authType === 'password') {
      connectConfig.password = config.password
    } else if (config.authType === 'key') {
      if (config.keyContent) {
        connectConfig.privateKey = config.keyContent
      } else if (config.keyPath) {
        connectConfig.privateKey = readFileSync(config.keyPath)
      } else {
        throw new Error('No private key selected')
      }
      if (config.keyPassphrase) connectConfig.passphrase = config.keyPassphrase
    } else if (config.authType === 'agent') {
      if (process.platform === 'win32') {
        const pageant = getPageantAgent()
        if (!pageant) throw new Error('Could not reach Pageant. Is it running?')
        connectConfig.agent = pageant as unknown as string
      } else {
        if (!process.env.SSH_AUTH_SOCK) throw new Error('SSH_AUTH_SOCK is not set; is ssh-agent running?')
        connectConfig.agent = process.env.SSH_AUTH_SOCK
      }
    }
    return connectConfig
  }

  /**
   * Connects, optionally through a chain of jump hosts (first hop first). Each hop is an SSH
   * connection of its own; the next connection's traffic is tunnelled through it.
   */
  async connect(config: ConnectionConfig, jumps: ConnectionConfig[] = []): Promise<void> {
    const chain = [...jumps, config]
    let sock: Duplex | undefined
    for (let i = 0; i < jumps.length; i++) {
      const hop = jumps[i]
      const next = chain[i + 1]
      const hopClient = new Client()
      this.jumpClients.push(hopClient)
      try {
        await new Promise<void>((resolve, reject) => {
          hopClient.once('ready', () => resolve()).once('error', reject)
          hopClient.connect({ ...this.buildConnectConfig(hop), ...(sock ? { sock } : {}) })
        })
        sock = await new Promise<Duplex>((resolve, reject) => {
          hopClient.forwardOut('127.0.0.1', 0, next.host, next.port || 22, (err, stream) =>
            err ? reject(err) : resolve(stream)
          )
        })
      } catch (err) {
        this.closeJumpClients()
        const reason = err instanceof Error ? err.message : String(err)
        throw new Error(`Jump host "${hop.name}": ${reason}`)
      }
    }

    const connectConfig = { ...this.buildConnectConfig(config), ...(sock ? { sock } : {}) }

    return new Promise((resolve, reject) => {
      this.client
        .on('ready', () => {
          // ssh2 defaults an unspecified pty to 80x24. Our terminal UI is almost always
          // considerably wider than that, and the actual size doesn't reach the remote until the
          // renderer mounts, fits, and round-trips a resize() call — a gap the shell can easily
          // fill with column-aligned output (ipconfig, ls -l, etc.) rendered for the wrong width.
          // Once the real resize() lands mid-stream, that output's cursor-positioning sequences
          // were computed against the stale narrow width and land in the wrong places, corrupting
          // what's on screen. Starting generously oversized avoids ever being too narrow — a
          // pty that's initially too *wide* is harmless once shrunk to fit.
          this.client.shell({ term: 'xterm-256color', cols: 220, rows: 50 }, (err, stream) => {
            if (err) {
              reject(err)
              return
            }
            this.shellStream = stream
            stream.on('data', (chunk: Buffer) => {
              this.dataListeners.forEach((l) => l(chunk))
            })
            stream.stderr.on('data', (chunk: Buffer) => {
              this.dataListeners.forEach((l) => l(chunk))
            })
            stream.on('close', () => {
              this.closeListeners.forEach((l) => l())
            })
            this.startTunnels(config.tunnels ?? [])
            resolve()
          })
        })
        .on('error', (err) => {
          this.closeJumpClients()
          reject(err)
        })
        .on('close', () => {
          this.stopTunnels()
          this.closeJumpClients()
          this.closeListeners.forEach((l) => l())
        })
        .connect(connectConfig)
    })
  }

  private notice(message: string): void {
    const line = Buffer.from(`\r\n\x1b[90m[tunnel] ${message}\x1b[0m\r\n`)
    this.dataListeners.forEach((l) => l(line))
  }

  private startTunnels(tunnels: PortForward[]): void {
    const remote = tunnels.filter((t) => t.type === 'remote')

    for (const t of tunnels.filter((x) => x.type === 'local')) {
      const server = net.createServer((socket) => {
        this.client.forwardOut('127.0.0.1', socket.remotePort ?? 0, t.destHost, t.destPort, (err, stream) => {
          if (err) {
            socket.destroy()
            return
          }
          socket.pipe(stream).pipe(socket)
          socket.on('error', () => stream.destroy())
          stream.on('error', () => socket.destroy())
        })
      })
      server.on('error', (err) =>
        this.notice(`local ${t.bindPort} → ${t.destHost}:${t.destPort} failed: ${err.message}`)
      )
      server.listen(t.bindPort, '127.0.0.1', () =>
        this.notice(`localhost:${t.bindPort} → ${t.destHost}:${t.destPort} (via server)`)
      )
      this.tunnelServers.push(server)
    }

    if (remote.length === 0) return
    this.client.on('tcp connection', (info, accept, rejectConn) => {
      const t = remote.find((r) => r.bindPort === info.destPort)
      if (!t) {
        rejectConn()
        return
      }
      const stream = accept()
      const socket = net.connect(t.destPort, t.destHost)
      stream.pipe(socket).pipe(stream)
      socket.on('error', () => stream.destroy())
      stream.on('error', () => socket.destroy())
    })
    for (const t of remote) {
      this.client.forwardIn('127.0.0.1', t.bindPort, (err) =>
        this.notice(
          err
            ? `remote ${t.bindPort} → ${t.destHost}:${t.destPort} failed: ${err.message}`
            : `server:${t.bindPort} → ${t.destHost}:${t.destPort} (from this PC)`
        )
      )
    }
  }

  private stopTunnels(): void {
    this.tunnelServers.forEach((s) => s.close())
    this.tunnelServers = []
  }

  private closeJumpClients(): void {
    this.jumpClients.forEach((c) => c.end())
    this.jumpClients = []
  }

  write(data: string): void {
    this.shellStream?.write(data)
  }

  /** Runs a one-off command on a separate exec channel (does not touch the interactive shell). */
  exec(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(err)
          return
        }
        let stdout = ''
        let stderr = ''
        stream
          .on('close', (code: number | null) => resolve({ stdout, stderr, code: code ?? 0 }))
          .on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf-8')
          })
          .stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf-8')
          })
      })
    })
  }

  resize(cols: number, rows: number): void {
    this.shellStream?.setWindow(rows, cols, 0, 0)
  }

  disconnect(): void {
    this.shellStream?.end()
    this.stopTunnels()
    this.client.end()
    this.closeJumpClients()
  }
}
