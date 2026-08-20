import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import type { ConnectionConfig } from '../shared/types'

function rdpTempDir(): string {
  const dir = join(app.getPath('temp'), 'burxat-connection-manager-rdp')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// RDP connections launch the OS's native client rather than an in-app terminal — there's no
// in-app RDP renderer here. The password is deliberately left out of the .rdp file (even
// though the format supports an encrypted field, that encryption is tied to the current
// Windows user profile and isn't worth the complexity) — the client just prompts for it.
export function launchRdp(conn: ConnectionConfig): void {
  const fullUsername = conn.rdpDomain ? `${conn.rdpDomain}\\${conn.username}` : conn.username
  const rdpContent = [
    `full address:s:${conn.host}:${conn.port}`,
    `username:s:${fullUsername}`,
    'prompt for credentials:i:1',
    'screen mode id:i:2',
    'use multimon:i:0'
  ].join('\r\n')

  const filePath = join(rdpTempDir(), `${randomUUID()}.rdp`)
  writeFileSync(filePath, rdpContent, 'utf-8')

  let child
  if (process.platform === 'win32') {
    child = spawn('mstsc.exe', [filePath], { detached: true, stdio: 'ignore' })
  } else if (process.platform === 'darwin') {
    child = spawn('open', [filePath], { detached: true, stdio: 'ignore' })
  } else {
    child = spawn('xfreerdp', [`/v:${conn.host}:${conn.port}`, `/u:${fullUsername}`], {
      detached: true,
      stdio: 'ignore'
    })
  }
  child.on('error', (err) => {
    console.error('Failed to launch RDP client:', err)
  })
  child.unref()
}
