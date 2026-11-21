import { execFile } from 'child_process'
import { homedir } from 'os'
import { randomUUID } from 'crypto'
import type { ConnectionConfig } from '../shared/types'

// Parsers that turn other tools' saved connections into ours. They only read; nothing is changed
// in the source files/registry.

function blank(name: string, host: string, username: string, port: number): ConnectionConfig {
  return { id: randomUUID(), type: 'connection', protocol: 'ssh', name, host, port, username, authType: 'password' }
}

function expandHome(path: string): string {
  return path.startsWith('~') ? homedir() + path.slice(1) : path
}

/** Parses OpenSSH client config text. Wildcard-only `Host` patterns (e.g. `*`) are skipped. */
export function parseSshConfig(text: string): ConnectionConfig[] {
  interface Entry {
    alias: string
    hostName?: string
    user?: string
    port?: number
    identityFile?: string
    proxyJump?: string
  }
  const entries: Entry[] = []
  let current: Entry[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const m = line.match(/^(\S+?)(?:\s*=\s*|\s+)(.+)$/)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim().replace(/^"(.*)"$/, '$1')

    if (key === 'host') {
      current = value
        .split(/\s+/)
        .filter((alias) => !/[*?!]/.test(alias))
        .map((alias) => ({ alias }))
      entries.push(...current)
    } else if (key === 'match') {
      current = []
    } else if (current.length > 0) {
      for (const e of current) {
        if (key === 'hostname') e.hostName = value
        else if (key === 'user') e.user = value
        else if (key === 'port') e.port = Number(value) || undefined
        else if (key === 'identityfile' && !e.identityFile) e.identityFile = value
        else if (key === 'proxyjump' && value.toLowerCase() !== 'none') e.proxyJump = value.split(',')[0].trim()
      }
    }
  }

  const byAlias = new Map<string, ConnectionConfig>()
  const result: ConnectionConfig[] = []
  for (const e of entries) {
    const conn = blank(e.alias, e.hostName ?? e.alias, e.user ?? '', e.port ?? 22)
    if (e.identityFile) {
      conn.authType = 'key'
      conn.keyPath = expandHome(e.identityFile)
    }
    byAlias.set(e.alias, conn)
    result.push(conn)
  }
  // ProxyJump can name another Host alias from the same file.
  for (const e of entries) {
    if (!e.proxyJump) continue
    const hop = byAlias.get(e.proxyJump.replace(/^.*@/, '').replace(/:\d+$/, ''))
    if (hop) byAlias.get(e.alias)!.jumpHostId = hop.id
  }
  return result
}

function regQuery(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('reg', ['query', ...args], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) =>
      resolve(err ? '' : String(stdout))
    )
  })
}

function regValue(output: string, name: string): string | null {
  const m = output.match(new RegExp(`^\\s*${name}\\s+REG_\\w+\\s*(.*)$`, 'im'))
  return m ? m[1].trim() : null
}

/** Reads saved PuTTY sessions from the current user's registry (Windows only). SSH sessions only. */
export async function readPuttySessions(): Promise<ConnectionConfig[]> {
  if (process.platform !== 'win32') return []
  const base = 'HKCU\\Software\\SimonTatham\\PuTTY\\Sessions'
  const list = await regQuery([base])
  const keys = list
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.toLowerCase().startsWith(base.toLowerCase() + '\\'))

  const result: ConnectionConfig[] = []
  for (const key of keys) {
    const out = await regQuery([key])
    const host = regValue(out, 'HostName')
    if (!host) continue
    const protocol = regValue(out, 'Protocol')
    if (protocol && protocol.toLowerCase() !== 'ssh') continue
    const rawName = key.slice(base.length + 1)
    let name = rawName
    try {
      name = decodeURIComponent(rawName)
    } catch {
      /* keep raw */
    }
    if (name === 'Default Settings') continue
    const portHex = regValue(out, 'PortNumber')
    const port = portHex ? parseInt(portHex, 16) || 22 : 22
    // PuTTY allows "user@host" in the host field.
    const at = host.indexOf('@')
    const user = regValue(out, 'UserName') || (at > 0 ? host.slice(0, at) : '')
    const conn = blank(name, at > 0 ? host.slice(at + 1) : host, user, port)
    const keyFile = regValue(out, 'PublicKeyFile')
    if (keyFile) {
      conn.authType = 'key'
      conn.keyPath = keyFile
    }
    result.push(conn)
  }
  return result
}
