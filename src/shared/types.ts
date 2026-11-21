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
  // References an entry in the vault's key library, so one key can serve many connections
  // without being copied into each. Takes precedence over keyContent/keyPath.
  keyId?: string
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

export interface VaultKey {
  id: string
  name: string
  content: string
}

export interface VaultData {
  root: FolderConfig
  // Private keys stored once and shared by id. Absent on vaults saved before this existed.
  keys?: VaultKey[]
  // Absent on vaults saved before this field existed.
  name?: string
  description?: string
}

export interface VaultUnlockResult {
  ok: boolean
  error?: string
  vaultExists: boolean
  path: string
  vaultName?: string
}

export type VaultAssociationStatus =
  | { supported: false; reason: string }
  | {
      supported: true
      /** The exe that would be registered (the portable launcher when there is one). */
      exePath: string
      /** ok: points here · stale: points at a Burxat exe elsewhere/missing · other-app: another
       * program is the .vault default · unregistered: nothing registered. */
      state: 'ok' | 'stale' | 'other-app' | 'unregistered'
      registeredPath: string | null
    }

export interface ChangePasswordResult {
  ok: boolean
  error?: string
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

export type TerminalStyle = 'default' | 'raw'

export interface AppSettings {
  defaultEditor: 'system' | string
  theme: 'dark' | 'light'
  terminalStyle: TerminalStyle
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
