import { app } from 'electron'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'

/**
 * Resolves where the encrypted vault lives so the app stays "portable":
 * data sits next to the executable, not in a fixed per-user profile path.
 */
export function resolveDataDir(): string {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (portableDir) return portableDir

  // Linux AppImage sets APPIMAGE to the mounted .AppImage path; OWD is the
  // original working directory the AppImage was launched from.
  const appImagePath = process.env.APPIMAGE
  if (appImagePath) return dirname(appImagePath)

  if (app.isPackaged) {
    // Fallback for non-portable packaged builds (e.g. unpacked dir run directly).
    return dirname(app.getPath('exe'))
  }

  // Dev mode: keep data in the project root under .data (gitignored).
  return join(app.getAppPath(), '.data')
}

export function vaultFilePath(): string {
  const dir = resolveDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'connections.vault')
}
