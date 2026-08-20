export type AuthType = 'password' | 'key' | 'agent'
export type ConnectionProtocol = 'ssh' | 'rdp'

export interface ConnectionConfig {
  id: string
  type: 'connection'
  // Absent on connections saved before RDP support was added — treat as 'ssh'.
  protocol?: ConnectionProtocol
  name: string
  host: string
  port: number
  username: string
  authType: AuthType
  password?: string
  keyPath?: string
  keyContent?: string
  keyFileName?: string
  keyPassphrase?: string
  color?: string
  // RDP-only
  rdpDomain?: string
}

export interface FolderConfig {
  id: string
  type: 'folder'
  name: string
  children: TreeNode[]
}

export type TreeNode = FolderConfig | ConnectionConfig

export interface VaultData {
  root: FolderConfig
}

export interface VaultUnlockResult {
  ok: boolean
  error?: string
  vaultExists: boolean
  path: string
}

export interface SessionStatus {
  sessionId: string
  status: 'connecting' | 'connected' | 'error' | 'closed'
  message?: string
}

export interface SftpEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymlink: boolean
  size: number
  modifyTime: number
  permissions: string
}

export interface SftpProgress {
  sessionId: string
  transferId: string
  direction: 'upload' | 'download'
  fileName: string
  bytesTransferred: number
  totalBytes: number
  done: boolean
  error?: string
}

export interface ServerStats {
  sessionId: string
  platform: 'unix' | 'windows'
  cpuPercent: number | null
  memUsedMB: number
  memTotalMB: number
}

export interface AppSettings {
  defaultEditor: 'system' | string
  theme: 'dark' | 'light'
  lastVaultPath?: string
}

export interface EditSession {
  editId: string
  sessionId: string
  remotePath: string
  fileName: string
}

export interface EditUploadEvent {
  editId: string
  fileName: string
  timestamp: number
  error?: string
}
