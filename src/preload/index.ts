import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  ConnectionConfig,
  EditSession,
  EditUploadEvent,
  FolderConfig,
  ServerStats,
  SessionStatus,
  SftpEntry,
  SftpProgress,
  VaultUnlockResult
} from '../shared/types'

const api = {
  vault: {
    status: (): Promise<VaultUnlockResult> => ipcRenderer.invoke(IPC.vaultStatus),
    create: (masterPassword: string): Promise<VaultUnlockResult> =>
      ipcRenderer.invoke(IPC.vaultCreate, masterPassword),
    unlock: (masterPassword: string): Promise<VaultUnlockResult> =>
      ipcRenderer.invoke(IPC.vaultUnlock, masterPassword),
    lock: (): Promise<void> => ipcRenderer.invoke(IPC.vaultLock),
    getTree: (): Promise<FolderConfig> => ipcRenderer.invoke(IPC.vaultGetTree),
    saveTree: (root: FolderConfig): Promise<void> => ipcRenderer.invoke(IPC.vaultSaveTree, root),
    pickExisting: (): Promise<VaultUnlockResult | null> => ipcRenderer.invoke(IPC.vaultPickExisting),
    pickNewLocation: (): Promise<VaultUnlockResult | null> => ipcRenderer.invoke(IPC.vaultPickNewLocation)
  },
  dialogs: {
    pickKeyFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.pickKeyFile),
    pickUploadFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.pickUploadFiles),
    pickDownloadDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.pickDownloadDir),
    pickEditorPath: (): Promise<string | null> => ipcRenderer.invoke(IPC.pickEditorPath),
    pickAndImportKeyFile: (): Promise<{ content: string; fileName: string } | null> =>
      ipcRenderer.invoke(IPC.pickAndImportKeyFile)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (settings: AppSettings): Promise<void> => ipcRenderer.invoke(IPC.settingsSet, settings)
  },
  view: {
    reload: (): Promise<void> => ipcRenderer.invoke(IPC.viewReload),
    forceReload: (): Promise<void> => ipcRenderer.invoke(IPC.viewForceReload),
    toggleDevTools: (): Promise<void> => ipcRenderer.invoke(IPC.viewToggleDevTools),
    zoomIn: (): Promise<void> => ipcRenderer.invoke(IPC.viewZoomIn),
    zoomOut: (): Promise<void> => ipcRenderer.invoke(IPC.viewZoomOut),
    resetZoom: (): Promise<void> => ipcRenderer.invoke(IPC.viewResetZoom),
    toggleFullScreen: (): Promise<void> => ipcRenderer.invoke(IPC.viewToggleFullScreen)
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appGetVersion)
  },
  clipboard: {
    readText: (): Promise<string> => ipcRenderer.invoke(IPC.clipboardReadText),
    writeText: (text: string): Promise<void> => ipcRenderer.invoke(IPC.clipboardWriteText, text)
  },
  rdp: {
    launch: (connection: ConnectionConfig): Promise<void> => ipcRenderer.invoke(IPC.rdpLaunch, connection)
  },
  session: {
    connect: (sessionId: string, config: ConnectionConfig): Promise<void> =>
      ipcRenderer.invoke(IPC.sessionConnect, sessionId, config),
    disconnect: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.sessionDisconnect, sessionId),
    write: (sessionId: string, data: string): void => ipcRenderer.send(IPC.sessionWrite, sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): void =>
      ipcRenderer.send(IPC.sessionResize, sessionId, cols, rows),
    setActive: (sessionId: string, active: boolean): void =>
      ipcRenderer.send(IPC.sessionSetActive, sessionId, active),
    onData: (cb: (sessionId: string, data: string) => void): (() => void) => {
      const listener = (_e: unknown, sessionId: string, data: string): void => cb(sessionId, data)
      ipcRenderer.on(IPC.sessionData, listener)
      return () => ipcRenderer.removeListener(IPC.sessionData, listener)
    },
    onStatus: (cb: (status: SessionStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: SessionStatus): void => cb(status)
      ipcRenderer.on(IPC.sessionStatus, listener)
      return () => ipcRenderer.removeListener(IPC.sessionStatus, listener)
    },
    onStats: (cb: (stats: ServerStats) => void): (() => void) => {
      const listener = (_e: unknown, stats: ServerStats): void => cb(stats)
      ipcRenderer.on(IPC.sessionStats, listener)
      return () => ipcRenderer.removeListener(IPC.sessionStats, listener)
    }
  },
  sftp: {
    list: (sessionId: string, path: string): Promise<SftpEntry[]> =>
      ipcRenderer.invoke(IPC.sftpList, sessionId, path),
    mkdir: (sessionId: string, path: string): Promise<void> => ipcRenderer.invoke(IPC.sftpMkdir, sessionId, path),
    rmdir: (sessionId: string, path: string): Promise<void> => ipcRenderer.invoke(IPC.sftpRmdir, sessionId, path),
    unlink: (sessionId: string, path: string): Promise<void> =>
      ipcRenderer.invoke(IPC.sftpUnlink, sessionId, path),
    rename: (sessionId: string, oldPath: string, newPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.sftpRename, sessionId, oldPath, newPath),
    home: (sessionId: string): Promise<string> => ipcRenderer.invoke(IPC.sftpHome, sessionId),
    copy: (sessionId: string, srcPath: string, destPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.sftpCopy, sessionId, srcPath, destPath),
    editStart: (sessionId: string, remotePath: string): Promise<EditSession> =>
      ipcRenderer.invoke(IPC.sftpEditStart, sessionId, remotePath),
    editStop: (editId: string): Promise<void> => ipcRenderer.invoke(IPC.sftpEditStop, editId),
    onEditUploaded: (cb: (event: EditUploadEvent) => void): (() => void) => {
      const listener = (_e: unknown, event: EditUploadEvent): void => cb(event)
      ipcRenderer.on(IPC.sftpEditUploaded, listener)
      return () => ipcRenderer.removeListener(IPC.sftpEditUploaded, listener)
    },
    onEditClosed: (cb: (editId: string) => void): (() => void) => {
      const listener = (_e: unknown, editId: string): void => cb(editId)
      ipcRenderer.on(IPC.sftpEditClosed, listener)
      return () => ipcRenderer.removeListener(IPC.sftpEditClosed, listener)
    },
    upload: (
      sessionId: string,
      transferId: string,
      localPath: string,
      remotePath: string,
      fileName: string
    ): Promise<void> => ipcRenderer.invoke(IPC.sftpUpload, sessionId, transferId, localPath, remotePath, fileName),
    download: (
      sessionId: string,
      transferId: string,
      remotePath: string,
      localPath: string,
      fileName: string
    ): Promise<void> =>
      ipcRenderer.invoke(IPC.sftpDownload, sessionId, transferId, remotePath, localPath, fileName),
    onProgress: (cb: (progress: SftpProgress) => void): (() => void) => {
      const listener = (_e: unknown, progress: SftpProgress): void => cb(progress)
      ipcRenderer.on(IPC.sftpProgress, listener)
      return () => ipcRenderer.removeListener(IPC.sftpProgress, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
