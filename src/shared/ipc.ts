export const IPC = {
  // Vault
  vaultStatus: 'vault:status',
  vaultCreate: 'vault:create',
  vaultUnlock: 'vault:unlock',
  vaultLock: 'vault:lock',
  vaultGetTree: 'vault:getTree',
  vaultSaveTree: 'vault:saveTree',
  vaultPickExisting: 'vault:pickExisting',
  vaultPickNewLocation: 'vault:pickNewLocation',

  // Dialogs
  pickKeyFile: 'dialog:pickKeyFile',
  pickUploadFiles: 'dialog:pickUploadFiles',
  pickDownloadDir: 'dialog:pickDownloadDir',
  pickEditorPath: 'dialog:pickEditorPath',
  pickAndImportKeyFile: 'dialog:pickAndImportKeyFile',

  // Settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  // View / app (moved here from the removed native menu bar)
  viewReload: 'view:reload',
  viewForceReload: 'view:forceReload',
  viewToggleDevTools: 'view:toggleDevTools',
  viewZoomIn: 'view:zoomIn',
  viewZoomOut: 'view:zoomOut',
  viewResetZoom: 'view:resetZoom',
  viewToggleFullScreen: 'view:toggleFullScreen',
  appGetVersion: 'app:getVersion',

  // Clipboard
  clipboardReadText: 'clipboard:readText',
  clipboardWriteText: 'clipboard:writeText',

  // RDP
  rdpLaunch: 'rdp:launch',

  // SSH session lifecycle
  sessionConnect: 'session:connect',
  sessionDisconnect: 'session:disconnect',
  sessionWrite: 'session:write',
  sessionResize: 'session:resize',
  sessionSetActive: 'session:setActive',
  sessionData: 'session:data', // main -> renderer
  sessionStatus: 'session:status', // main -> renderer
  sessionStats: 'session:stats', // main -> renderer

  // SFTP
  sftpList: 'sftp:list',
  sftpMkdir: 'sftp:mkdir',
  sftpRmdir: 'sftp:rmdir',
  sftpUnlink: 'sftp:unlink',
  sftpRename: 'sftp:rename',
  sftpUpload: 'sftp:upload',
  sftpDownload: 'sftp:download',
  sftpHome: 'sftp:home',
  sftpCopy: 'sftp:copy',
  sftpProgress: 'sftp:progress', // main -> renderer

  // SFTP edit-in-external-app
  sftpEditStart: 'sftp:editStart',
  sftpEditStop: 'sftp:editStop',
  sftpEditUploaded: 'sftp:editUploaded', // main -> renderer
  sftpEditClosed: 'sftp:editClosed' // main -> renderer
} as const
