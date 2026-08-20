import { app } from 'electron'
import { existsSync, mkdirSync, rmSync, watch, type FSWatcher } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { spawn, type ChildProcess } from 'child_process'
import type { SftpManager } from './sftpManager'
import type { EditSession, EditUploadEvent } from '../../shared/types'

interface ActiveEdit {
  editId: string
  sessionId: string
  remotePath: string
  localPath: string
  fileName: string
  watcher: FSWatcher
  debounceTimer: NodeJS.Timeout | null
}

const activeEdits = new Map<string, ActiveEdit>()

function editTempDir(sessionId: string): string {
  const dir = join(app.getPath('temp'), 'burxat-connection-manager-edit', sessionId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Opens `localPath` in an editor and returns a ChildProcess whose 'exit' event fires when
 * the user closes the file — or null if we have no reliable way to detect that (Linux system
 * default: xdg-open doesn't block, so there's nothing to wait on).
 */
function openTracked(localPath: string, editorPath: string): ChildProcess | null {
  if (editorPath !== 'system') {
    return spawn(editorPath, [localPath])
  }
  if (process.platform === 'win32') {
    // `start /wait "" <file>` blocks until the associated app for the file closes.
    return spawn('cmd.exe', ['/c', 'start', '/wait', '""', localPath], { windowsHide: true })
  }
  if (process.platform === 'darwin') {
    return spawn('open', ['-W', '-n', localPath])
  }
  // Linux: no universal blocking "open" — fall back to fire-and-forget.
  spawn('xdg-open', [localPath], { detached: true, stdio: 'ignore' }).unref()
  return null
}

async function uploadNow(
  sftp: SftpManager,
  localPath: string,
  remotePath: string,
  editId: string,
  fileName: string,
  onUploaded: (event: EditUploadEvent) => void
): Promise<void> {
  try {
    await sftp.upload(localPath, remotePath)
    onUploaded({ editId, fileName, timestamp: Date.now() })
  } catch (err) {
    onUploaded({ editId, fileName, timestamp: Date.now(), error: err instanceof Error ? err.message : String(err) })
  }
}

export async function startEdit(
  sessionId: string,
  sftp: SftpManager,
  remotePath: string,
  editorPath: string,
  onUploaded: (event: EditUploadEvent) => void,
  onEditorClosed: (editId: string) => void
): Promise<EditSession> {
  const fileName = remotePath.split('/').pop() || 'file'
  const localPath = join(editTempDir(sessionId), fileName)
  await sftp.download(remotePath, localPath)

  const editId = randomUUID()

  const watcher = watch(localPath, { persistent: false }, () => {
    const active = activeEdits.get(editId)
    if (!active) return
    if (active.debounceTimer) clearTimeout(active.debounceTimer)
    // Debounce: editors often emit several change events per save (write + metadata).
    active.debounceTimer = setTimeout(() => {
      active.debounceTimer = null
      uploadNow(sftp, localPath, remotePath, editId, fileName, onUploaded)
    }, 600)
  })

  activeEdits.set(editId, { editId, sessionId, remotePath, localPath, fileName, watcher, debounceTimer: null })

  const child = openTracked(localPath, editorPath)
  child?.on('exit', async () => {
    const active = activeEdits.get(editId)
    if (!active) return
    // Flush any save that happened right before the editor closed rather than losing it.
    if (active.debounceTimer) {
      clearTimeout(active.debounceTimer)
      active.debounceTimer = null
      await uploadNow(sftp, localPath, remotePath, editId, fileName, onUploaded)
    }
    stopEdit(editId)
    onEditorClosed(editId)
  })
  child?.on('error', () => {
    // Editor failed to launch (e.g. bad custom editor path) — nothing to track.
  })

  return { editId, sessionId, remotePath, fileName }
}

export function stopEdit(editId: string): void {
  const active = activeEdits.get(editId)
  if (!active) return
  if (active.debounceTimer) clearTimeout(active.debounceTimer)
  active.watcher.close()
  activeEdits.delete(editId)
  try {
    rmSync(active.localPath, { force: true })
  } catch {
    // Best-effort cleanup — the OS temp dir will get cleared eventually regardless.
  }
}

export function stopAllEditsForSession(sessionId: string): void {
  for (const [editId, active] of activeEdits) {
    if (active.sessionId === sessionId) stopEdit(editId)
  }
}
