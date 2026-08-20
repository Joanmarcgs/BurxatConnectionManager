import { app, BrowserWindow, ipcMain, dialog, Menu, WebContents, clipboard } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, existsSync } from 'fs'
import { is } from './is'
import { secureStore } from './secureStore'
import { getSettings, saveSettings } from './settingsStore'
import { SshSession } from './ssh/sshSession'
import { SftpManager } from './ssh/sftpManager'
import { startStatsPolling } from './ssh/statsPoller'
import { startEdit, stopEdit, stopAllEditsForSession } from './ssh/editSessionManager'
import { launchRdp } from './rdp'
import { IPC } from '../shared/ipc'
import type { AppSettings, ConnectionConfig, FolderConfig, VaultUnlockResult } from '../shared/types'

interface ActiveSession {
  session: SshSession
  sftp: SftpManager
  stopStats: () => void
}

const activeSessions = new Map<string, ActiveSession>()
let mainWindow: BrowserWindow | null = null

// Session I/O, stats polling, and SFTP transfers all deliver results asynchronously; the
// window (and its WebContents) can be destroyed by the time a callback fires, and sending on a
// destroyed WebContents throws. Route every renderer push through this guard.
function safeSend(sender: WebContents, channel: string, ...args: unknown[]): void {
  if (!sender.isDestroyed()) sender.send(channel, ...args)
}

function createWindow(): void {
  // Packaged builds get their icon baked into the exe by electron-builder; this only matters
  // for dev mode, where Electron would otherwise show its own default icon.
  const devIconPath = join(__dirname, '../../build/icon.ico')

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon: existsSync(devIconPath) ? devIconPath : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.once('ready-to-show', () => win.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  const lastVaultPath = getSettings().lastVaultPath
  if (lastVaultPath && existsSync(lastVaultPath)) secureStore.setPath(lastVaultPath)

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const { session, stopStats } of activeSessions.values()) {
    stopStats()
    session.disconnect()
  }
  activeSessions.clear()
  if (process.platform !== 'darwin') app.quit()
})

function registerIpcHandlers(): void {
  // --- Vault ---
  function rememberLastVaultPath(): void {
    saveSettings({ ...getSettings(), lastVaultPath: secureStore.getPath() })
  }

  ipcMain.handle(IPC.vaultStatus, (): VaultUnlockResult => {
    return { ok: secureStore.isUnlocked(), vaultExists: secureStore.vaultExists(), path: secureStore.getPath() }
  })

  ipcMain.handle(IPC.vaultCreate, (_e, masterPassword: string): VaultUnlockResult => {
    secureStore.create(masterPassword)
    rememberLastVaultPath()
    return { ok: true, vaultExists: true, path: secureStore.getPath() }
  })

  ipcMain.handle(IPC.vaultUnlock, (_e, masterPassword: string): VaultUnlockResult => {
    const ok = secureStore.unlock(masterPassword)
    if (ok) rememberLastVaultPath()
    return {
      ok,
      vaultExists: true,
      path: secureStore.getPath(),
      error: ok ? undefined : 'Incorrect master password'
    }
  })

  ipcMain.handle(IPC.vaultLock, () => {
    secureStore.lock()
  })

  ipcMain.handle(IPC.vaultPickExisting, async (): Promise<VaultUnlockResult | null> => {
    const result = await dialog.showOpenDialog({
      defaultPath: dirname(secureStore.getPath()),
      properties: ['openFile'],
      filters: [
        { name: 'Vault files', extensions: ['vault'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return null
    secureStore.setPath(result.filePaths[0])
    return { ok: false, vaultExists: secureStore.vaultExists(), path: secureStore.getPath() }
  })

  ipcMain.handle(IPC.vaultPickNewLocation, async (): Promise<VaultUnlockResult | null> => {
    const result = await dialog.showSaveDialog({
      defaultPath: join(dirname(secureStore.getPath()), 'connections.vault'),
      filters: [{ name: 'Vault files', extensions: ['vault'] }]
    })
    if (result.canceled || !result.filePath) return null
    const filePath = result.filePath.endsWith('.vault') ? result.filePath : `${result.filePath}.vault`
    secureStore.setPath(filePath)
    return { ok: false, vaultExists: secureStore.vaultExists(), path: secureStore.getPath() }
  })

  ipcMain.handle(IPC.vaultGetTree, (): FolderConfig => {
    return secureStore.getData().root
  })

  ipcMain.handle(IPC.vaultSaveTree, (_e, root: FolderConfig) => {
    secureStore.getData().root = root
    secureStore.save()
  })

  // --- Dialogs ---
  ipcMain.handle(IPC.pickKeyFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Private keys', extensions: ['ppk', 'pem', 'key', '*'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.pickAndImportKeyFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Private keys', extensions: ['ppk', 'pem', 'key', '*'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    const content = readFileSync(filePath, 'utf-8')
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath
    return { content, fileName }
  })

  ipcMain.handle(IPC.pickUploadFiles, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(IPC.pickDownloadDir, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.pickEditorPath, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'Executables', extensions: ['exe'] }, { name: 'All files', extensions: ['*'] }]
          : [{ name: 'All files', extensions: ['*'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // --- Settings ---
  ipcMain.handle(IPC.settingsGet, (): AppSettings => getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, settings: AppSettings) => saveSettings(settings))

  // --- View / app (moved here from the removed native menu bar) ---
  ipcMain.handle(IPC.viewReload, () => mainWindow?.webContents.reload())
  ipcMain.handle(IPC.viewForceReload, () => mainWindow?.webContents.reloadIgnoringCache())
  ipcMain.handle(IPC.viewToggleDevTools, () => mainWindow?.webContents.toggleDevTools())
  ipcMain.handle(IPC.viewZoomIn, () => {
    if (!mainWindow) return
    mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5)
  })
  ipcMain.handle(IPC.viewZoomOut, () => {
    if (!mainWindow) return
    mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5)
  })
  ipcMain.handle(IPC.viewResetZoom, () => mainWindow?.webContents.setZoomLevel(0))
  ipcMain.handle(IPC.viewToggleFullScreen, () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()))
  ipcMain.handle(IPC.appGetVersion, () => app.getVersion())

  // --- Clipboard (routed through Electron's clipboard module rather than the sandboxed
  // renderer's navigator.clipboard, which requires a permission handshake for reads) ---
  ipcMain.handle(IPC.clipboardReadText, () => clipboard.readText())
  ipcMain.handle(IPC.clipboardWriteText, (_e, text: string) => clipboard.writeText(text))

  // --- RDP (launches the OS's native client — no in-app RDP renderer) ---
  ipcMain.handle(IPC.rdpLaunch, (_e, connection: ConnectionConfig) => launchRdp(connection))

  // --- SSH sessions ---
  ipcMain.handle(IPC.sessionConnect, async (event, sessionId: string, config: ConnectionConfig) => {
    const session = new SshSession(sessionId)
    const sender = event.sender

    session.onData((chunk) => {
      safeSend(sender, IPC.sessionData, sessionId, chunk.toString('utf-8'))
    })
    session.onClose(() => {
      safeSend(sender, IPC.sessionStatus, { sessionId, status: 'closed' })
      activeSessions.get(sessionId)?.stopStats()
      activeSessions.delete(sessionId)
      stopAllEditsForSession(sessionId)
    })

    try {
      await session.connect(config)
      const stopStats = startStatsPolling(session, sessionId, (stats) => {
        safeSend(sender, IPC.sessionStats, stats)
      })
      activeSessions.set(sessionId, { session, sftp: new SftpManager(session.getClient()), stopStats })
      safeSend(sender, IPC.sessionStatus, { sessionId, status: 'connected' })
    } catch (err) {
      safeSend(sender, IPC.sessionStatus, {
        sessionId,
        status: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
      throw err
    }
  })

  ipcMain.handle(IPC.sessionDisconnect, (_e, sessionId: string) => {
    const active = activeSessions.get(sessionId)
    active?.stopStats()
    active?.session.disconnect()
    activeSessions.delete(sessionId)
    stopAllEditsForSession(sessionId)
  })

  ipcMain.on(IPC.sessionWrite, (_e, sessionId: string, data: string) => {
    activeSessions.get(sessionId)?.session.write(data)
  })

  ipcMain.on(IPC.sessionResize, (_e, sessionId: string, cols: number, rows: number) => {
    activeSessions.get(sessionId)?.session.resize(cols, rows)
  })

  // --- SFTP ---
  function getSftp(sessionId: string): SftpManager {
    const active = activeSessions.get(sessionId)
    if (!active) throw new Error('Session is not connected')
    return active.sftp
  }

  ipcMain.handle(IPC.sftpList, (_e, sessionId: string, path: string) => getSftp(sessionId).list(path))
  ipcMain.handle(IPC.sftpMkdir, (_e, sessionId: string, path: string) => getSftp(sessionId).mkdir(path))
  ipcMain.handle(IPC.sftpRmdir, (_e, sessionId: string, path: string) => getSftp(sessionId).rmdir(path))
  ipcMain.handle(IPC.sftpUnlink, (_e, sessionId: string, path: string) => getSftp(sessionId).unlink(path))
  ipcMain.handle(IPC.sftpRename, (_e, sessionId: string, oldPath: string, newPath: string) =>
    getSftp(sessionId).rename(oldPath, newPath)
  )
  ipcMain.handle(IPC.sftpHome, async (_e, sessionId: string) => getSftp(sessionId).realpath('.'))
  ipcMain.handle(IPC.sftpCopy, (_e, sessionId: string, srcPath: string, destPath: string) =>
    getSftp(sessionId).copy(srcPath, destPath)
  )

  ipcMain.handle(IPC.sftpEditStart, async (event, sessionId: string, remotePath: string) => {
    const sender = event.sender
    const settings = getSettings()
    return startEdit(
      sessionId,
      getSftp(sessionId),
      remotePath,
      settings.defaultEditor,
      (uploadEvent) => safeSend(sender, IPC.sftpEditUploaded, uploadEvent),
      (editId) => safeSend(sender, IPC.sftpEditClosed, editId)
    )
  })

  ipcMain.handle(IPC.sftpEditStop, (_e, editId: string) => stopEdit(editId))

  ipcMain.handle(
    IPC.sftpUpload,
    async (event, sessionId: string, transferId: string, localPath: string, remotePath: string, fileName: string) => {
      const sender = event.sender
      await getSftp(sessionId).upload(localPath, remotePath, (transferred, total) => {
        safeSend(sender, IPC.sftpProgress, {
          sessionId,
          transferId,
          direction: 'upload',
          fileName,
          bytesTransferred: transferred,
          totalBytes: total,
          done: transferred >= total
        })
      })
    }
  )

  ipcMain.handle(
    IPC.sftpDownload,
    async (event, sessionId: string, transferId: string, remotePath: string, localPath: string, fileName: string) => {
      const sender = event.sender
      await getSftp(sessionId).download(remotePath, localPath, (transferred, total) => {
        safeSend(sender, IPC.sftpProgress, {
          sessionId,
          transferId,
          direction: 'download',
          fileName,
          bytesTransferred: transferred,
          totalBytes: total,
          done: transferred >= total
        })
      })
    }
  )
}
