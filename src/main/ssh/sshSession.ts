import ssh2, { type Client as ClientType, type ClientChannel, type ConnectConfig } from 'ssh2'
import { readFileSync } from 'fs'
import { getPageantAgent } from './pageantAgent'
import type { ConnectionConfig } from '../../shared/types'

const { Client } = ssh2

export type SshDataListener = (chunk: Buffer) => void
export type SshCloseListener = (err?: Error) => void

export class SshSession {
  readonly id: string
  private client = new Client()
  private shellStream: ClientChannel | null = null
  private dataListeners = new Set<SshDataListener>()
  private closeListeners = new Set<SshCloseListener>()

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

  connect(config: ConnectionConfig): Promise<void> {
    return new Promise((resolve, reject) => {
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
          reject(new Error('No private key selected'))
          return
        }
        if (config.keyPassphrase) connectConfig.passphrase = config.keyPassphrase
      } else if (config.authType === 'agent') {
        if (process.platform === 'win32') {
          const pageant = getPageantAgent()
          if (!pageant) {
            reject(new Error('Could not reach Pageant. Is it running?'))
            return
          }
          connectConfig.agent = pageant as unknown as string
        } else {
          if (!process.env.SSH_AUTH_SOCK) {
            reject(new Error('SSH_AUTH_SOCK is not set; is ssh-agent running?'))
            return
          }
          connectConfig.agent = process.env.SSH_AUTH_SOCK
        }
      }

      this.client
        .on('ready', () => {
          this.client.shell({ term: 'xterm-256color' }, (err, stream) => {
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
            resolve()
          })
        })
        .on('error', (err) => {
          reject(err)
        })
        .on('close', () => {
          this.closeListeners.forEach((l) => l())
        })
        .connect(connectConfig)
    })
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
    this.client.end()
  }
}
