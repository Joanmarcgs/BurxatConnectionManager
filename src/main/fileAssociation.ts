import { app } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import type { VaultAssociationStatus } from '../shared/types'

// Windows only. Everything here lives under HKCU (the current user) — no admin rights, and other
// users on the machine are unaffected. Windows 11 protects the user's explicit "default app"
// choice (UserChoice), so this never tries to forge it: it registers the file type, and keeps
// pointing at the current location whichever Burxat entry the user already chose as default.

const PROG_ID = 'BurxatConnectionManager.Vault'
const FILE_EXTS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.vault'
const CLASSES = 'HKCU\\Software\\Classes'

function reg(args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout) }))
  })
}

/** Reads a registry value's data (REG_SZ) or null. `name` undefined = the (Default) value. */
async function readValue(key: string, name?: string): Promise<string | null> {
  const { ok, stdout } = await reg(name ? ['query', key, '/v', name] : ['query', key, '/ve'])
  if (!ok) return null
  const line = stdout.split(/\r?\n/).find((l) => /REG_(EXPAND_)?SZ/.test(l))
  if (!line) return null
  return line.replace(/^\s*\S+\s+REG_(EXPAND_)?SZ\s*/, '').trim() || null
}

/**
 * The executable to register: the portable launcher (what the user actually double-clicks and
 * what passes the file argument through), or the app's own exe for a plain packaged build.
 * Null when running unpackaged (dev), where there's nothing meaningful to register.
 */
function registrableExe(): string | null {
  if (process.platform !== 'win32') return null
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (portableDir) {
    const launcher = join(portableDir, basename(app.getPath('exe')))
    if (existsSync(launcher)) return launcher
  }
  return app.isPackaged ? app.getPath('exe') : null
}

/** True for an exe that is this app (by the product's name, or the same file name as the running one). */
function isOurExe(path: string): boolean {
  const name = basename(path)
  return /burxat/i.test(name) || name.toLowerCase() === basename(app.getPath('exe')).toLowerCase()
}

function exeFromCommand(command: string | null): string | null {
  if (!command) return null
  const m = command.match(/^\s*"([^"]+)"/) ?? command.match(/^\s*(\S+)/)
  return m ? m[1] : null
}

/** ProgId Windows currently uses for .vault: the user's explicit choice, else the type default. */
async function effectiveProgId(): Promise<string | null> {
  return (await readValue(`${FILE_EXTS_KEY}\\UserChoice`, 'ProgId')) ?? (await readValue(`${CLASSES}\\.vault`))
}

export async function getVaultAssociation(): Promise<VaultAssociationStatus> {
  const exe = registrableExe()
  if (process.platform !== 'win32') return { supported: false, reason: 'Only available on Windows.' }
  if (!exe) return { supported: false, reason: 'Only available in the packaged app, not in development.' }

  const progId = await effectiveProgId()
  if (!progId) return { supported: true, exePath: exe, state: 'unregistered', registeredPath: null }

  const registeredPath = exeFromCommand(await readValue(`${CLASSES}\\${progId}\\shell\\open\\command`))
  if (!registeredPath) return { supported: true, exePath: exe, state: 'unregistered', registeredPath: null }
  if (!isOurExe(registeredPath)) {
    return { supported: true, exePath: exe, state: 'other-app', registeredPath }
  }
  const matches = registeredPath.toLowerCase() === exe.toLowerCase() && existsSync(registeredPath)
  return { supported: true, exePath: exe, state: matches ? 'ok' : 'stale', registeredPath }
}

export async function registerVaultAssociation(): Promise<VaultAssociationStatus> {
  const exe = registrableExe()
  if (!exe) return getVaultAssociation()

  const command = `"${exe}" "%1"`
  const exeName = basename(exe)
  const set = (key: string, data: string, name?: string): Promise<unknown> =>
    reg(name ? ['add', key, '/v', name, '/d', data, '/f'] : ['add', key, '/ve', '/d', data, '/f'])

  // Our own file type definition, plus the "Open with" entry for this exe.
  await set(`${CLASSES}\\.vault`, PROG_ID)
  await set(`${CLASSES}\\${PROG_ID}`, "Burxat's Connection Manager vault")
  await set(`${CLASSES}\\${PROG_ID}\\DefaultIcon`, `"${exe}",0`)
  await set(`${CLASSES}\\${PROG_ID}\\shell\\open\\command`, command)
  await set(`${CLASSES}\\Applications\\${exeName}`, "Burxat's Connection Manager", 'FriendlyAppName')
  await set(`${CLASSES}\\Applications\\${exeName}\\shell\\open\\command`, command)

  // If the user already chose a Burxat entry as the default (e.g. Windows' own "vault_auto_file"
  // from the first "Always"), repoint that one too — it's what actually runs on double-click, and
  // otherwise it keeps pointing at wherever the app used to be. Never touch another app's entry.
  const chosen = await readValue(`${FILE_EXTS_KEY}\\UserChoice`, 'ProgId')
  if (chosen) {
    const chosenKey = `${CLASSES}\\${chosen}\\shell\\open\\command`
    const existing = exeFromCommand(await readValue(chosenKey))
    if (existing && isOurExe(existing)) await set(chosenKey, command)
  }

  return getVaultAssociation()
}
