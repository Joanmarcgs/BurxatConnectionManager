import { useEffect, useState } from 'react'
import { useVaultStore } from '../../state/vaultStore'
import { useSessionStore } from '../../state/sessionStore'
import { vaultDisplayName } from '../../utils/vaultName'
import ConnectionDialog from './ConnectionDialog'
import PromptModal from '../common/PromptModal'
import ChangePasswordModal from '../common/ChangePasswordModal'
import TreeItem from './TreeItem'
import type { ConnectionConfig, FolderConfig, TreeNode } from '../../../../shared/types'
import styles from './Sidebar.module.css'

export interface ContextMenuState {
  x: number
  y: number
  node: TreeNode
}

/**
 * Live search: keeps connections whose name or host matches, plus the folders leading to them.
 * A folder whose own name matches is kept whole.
 */
function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  const out: TreeNode[] = []
  for (const node of nodes) {
    if (node.type === 'folder') {
      if (node.name.toLowerCase().includes(q)) out.push(node)
      else {
        const children = filterTree(node.children, q)
        if (children.length > 0) out.push({ ...node, children })
      }
    } else if (node.name.toLowerCase().includes(q) || node.host.toLowerCase().includes(q)) {
      out.push(node)
    }
  }
  return out
}

function allFolderIds(node: TreeNode, ids = new Set<string>()): Set<string> {
  if (node.type === 'folder') {
    ids.add(node.id)
    node.children.forEach((c) => allFolderIds(c, ids))
  }
  return ids
}

export default function Sidebar(): JSX.Element {
  const root = useVaultStore((s) => s.root)
  const addFolder = useVaultStore((s) => s.addFolder)
  const renameNode = useVaultStore((s) => s.renameNode)
  const deleteNode = useVaultStore((s) => s.deleteNode)
  const moveNode = useVaultStore((s) => s.moveNode)
  const duplicateConnection = useVaultStore((s) => s.duplicateConnection)
  const importConnections = useVaultStore((s) => s.importConnections)
  const lockVault = useVaultStore((s) => s.lockVault)
  const path = useVaultStore((s) => s.path)
  const vaultName = useVaultStore((s) => s.vaultName)
  const pickExistingVault = useVaultStore((s) => s.pickExistingVault)
  const requestCreateNew = useVaultStore((s) => s.requestCreateNew)
  const saveVaultAs = useVaultStore((s) => s.saveVaultAs)
  const openConnection = useSessionStore((s) => s.openConnection)

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [dialogState, setDialogState] = useState<{ parentId: string; conn?: ConnectionConfig } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['root']))
  const [promptState, setPromptState] = useState<
    { mode: 'new-folder'; parentId: string } | { mode: 'rename'; id: string; initial: string } | null
  >(null)
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    function close(): void {
      setMenu(null)
      setVaultMenuOpen(false)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  async function handleOpenDifferentVault(): Promise<void> {
    setVaultMenuOpen(false)
    await lockVault()
    await pickExistingVault()
  }

  async function handleCreateNewVault(): Promise<void> {
    setVaultMenuOpen(false)
    await requestCreateNew()
  }

  async function handleLockVault(): Promise<void> {
    setVaultMenuOpen(false)
    await lockVault()
  }

  async function handleSaveVaultAs(): Promise<void> {
    setVaultMenuOpen(false)
    await saveVaultAs()
  }

  async function handleImport(source: 'ssh' | 'putty'): Promise<void> {
    setVaultMenuOpen(false)
    const found = source === 'ssh' ? await window.api.dialogs.importSshConfig() : await window.api.dialogs.importPutty()
    if (found === null) return
    const label = source === 'ssh' ? 'SSH config' : 'PuTTY'
    if (found.length === 0) {
      window.alert(`No ${label} connections were found.`)
      return
    }
    const n = await importConnections(`Imported from ${label}`, found)
    window.alert(`Imported ${n} connection${n === 1 ? '' : 's'} into the folder "Imported from ${label}".`)
  }

  function handleChangePassword(): void {
    setVaultMenuOpen(false)
    setShowChangePassword(true)
  }

  if (!root) return <div className={styles.wrap} />

  const searching = query.trim() !== ''
  const visibleNodes = searching ? filterTree(root.children, query.trim().toLowerCase()) : root.children

  function toggleExpand(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleContextMenu(e: React.MouseEvent, node: TreeNode): void {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, node })
  }

  async function handleConnect(conn: ConnectionConfig): Promise<void> {
    if (conn.protocol === 'rdp') {
      await window.api.rdp.launch(conn)
      return
    }
    await openConnection(conn)
  }

  return (
    <div className={styles.wrap} onContextMenu={(e) => handleContextMenu(e, root)}>
      <div className={styles.header}>
        <div className={styles.headerActions}>
          <button
            className={styles.lockBtn}
            title={`Vault menu — ${vaultName || vaultDisplayName(path)}`}
            onClick={(e) => {
              e.stopPropagation()
              setVaultMenuOpen((v) => !v)
            }}
          >
            ☰
          </button>
          {vaultMenuOpen && (
            <div className={styles.vaultMenu} onClick={(e) => e.stopPropagation()}>
              <div className={styles.menuItem} onClick={handleOpenDifferentVault}>
                Open a different vault
              </div>
              <div className={styles.menuItem} onClick={handleCreateNewVault}>
                Create a new vault
              </div>
              <div className={styles.menuItem} onClick={handleLockVault}>
                Lock vault
              </div>
              <div className={styles.menuItem} onClick={handleSaveVaultAs}>
                Save current vault as
              </div>
              <div className={styles.menuItem} onClick={() => handleImport('ssh')}>
                Import from SSH config…
              </div>
              <div className={styles.menuItem} onClick={() => handleImport('putty')}>
                Import from PuTTY…
              </div>
              <div className={styles.menuItem} onClick={handleChangePassword}>
                Change master password
              </div>
            </div>
          )}
        </div>
        <div className={styles.searchBox} onContextMenu={(e) => e.stopPropagation()}>
          <input
            className={styles.searchInput}
            value={query}
            placeholder="Search connections"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
            }}
          />
          <span className={styles.searchIcon} aria-hidden>
            🔍
          </span>
        </div>
      </div>

      <div className={styles.tree}>
        {root.children.length === 0 && (
          <div className={styles.emptyHint}>Right-click here to add a folder or connection</div>
        )}
        {searching && visibleNodes.length === 0 && root.children.length > 0 && (
          <div className={styles.emptyHint}>No connections match "{query.trim()}"</div>
        )}
        {visibleNodes.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            depth={0}
            expanded={searching ? allFolderIds(root) : expanded}
            onToggleExpand={toggleExpand}
            onContextMenu={handleContextMenu}
            onConnect={handleConnect}
            onMove={moveNode}
          />
        ))}
      </div>

      {menu && (
        <SidebarContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onNewFolder={() => {
            const parentId = menu.node.type === 'folder' ? menu.node.id : root.id
            setPromptState({ mode: 'new-folder', parentId })
            setMenu(null)
          }}
          onNewConnection={() => {
            const parentId = menu.node.type === 'folder' ? menu.node.id : root.id
            setDialogState({ parentId })
            setMenu(null)
          }}
          onEdit={
            menu.node.type === 'connection'
              ? () => {
                  setDialogState({ parentId: root.id, conn: menu.node as ConnectionConfig })
                  setMenu(null)
                }
              : undefined
          }
          onDuplicate={
            menu.node.type === 'connection'
              ? () => {
                  duplicateConnection(menu.node.id)
                  setMenu(null)
                }
              : undefined
          }
          onRename={
            menu.node.id !== root.id
              ? () => {
                  setPromptState({ mode: 'rename', id: menu.node.id, initial: menu.node.name })
                  setMenu(null)
                }
              : undefined
          }
          onDelete={
            menu.node.id !== root.id
              ? () => {
                  if (window.confirm(`Delete "${menu.node.name}"?`)) deleteNode(menu.node.id)
                  setMenu(null)
                }
              : undefined
          }
          onConnect={
            menu.node.type === 'connection'
              ? () => {
                  handleConnect(menu.node as ConnectionConfig)
                  setMenu(null)
                }
              : undefined
          }
        />
      )}

      {dialogState && (
        <ConnectionDialog
          parentId={dialogState.parentId}
          existing={dialogState.conn}
          onClose={() => setDialogState(null)}
        />
      )}

      {promptState && promptState.mode === 'new-folder' && (
        <PromptModal
          title="New folder"
          label="Folder name"
          confirmLabel="Create"
          onCancel={() => setPromptState(null)}
          onSubmit={(name) => {
            addFolder(promptState.parentId, name)
            setExpanded((prev) => new Set(prev).add(promptState.parentId))
            setPromptState(null)
          }}
        />
      )}

      {promptState && promptState.mode === 'rename' && (
        <PromptModal
          title="Rename"
          label="New name"
          initialValue={promptState.initial}
          confirmLabel="Rename"
          onCancel={() => setPromptState(null)}
          onSubmit={(name) => {
            renameNode(promptState.id, name)
            setPromptState(null)
          }}
        />
      )}

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  )
}

function SidebarContextMenu(props: {
  menu: ContextMenuState
  onClose: () => void
  onNewFolder: () => void
  onNewConnection: () => void
  onEdit?: () => void
  onDuplicate?: () => void
  onRename?: () => void
  onDelete?: () => void
  onConnect?: () => void
}): JSX.Element {
  const { menu } = props
  return (
    <div className={styles.menu} style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      {props.onConnect && <MenuItem label="Connect" onClick={props.onConnect} />}
      <MenuItem label="New folder" onClick={props.onNewFolder} />
      <MenuItem label="New connection" onClick={props.onNewConnection} />
      {props.onEdit && <MenuItem label="Edit" onClick={props.onEdit} />}
      {props.onDuplicate && <MenuItem label="Duplicate" onClick={props.onDuplicate} />}
      {props.onRename && <MenuItem label="Rename" onClick={props.onRename} />}
      {props.onDelete && <MenuItem label="Delete" onClick={props.onDelete} danger />}
    </div>
  )
}

function MenuItem(props: { label: string; onClick: () => void; danger?: boolean }): JSX.Element {
  return (
    <div className={`${styles.menuItem} ${props.danger ? styles.menuItemDanger : ''}`} onClick={props.onClick}>
      {props.label}
    </div>
  )
}

export type { FolderConfig }
