import { useEffect, useState } from 'react'
import { useVaultStore } from '../../state/vaultStore'
import { useSessionStore } from '../../state/sessionStore'
import { vaultDisplayName } from '../../utils/vaultName'
import ConnectionDialog from './ConnectionDialog'
import PromptModal from '../common/PromptModal'
import TreeItem from './TreeItem'
import type { ConnectionConfig, FolderConfig, TreeNode } from '../../../../shared/types'
import styles from './Sidebar.module.css'

export interface ContextMenuState {
  x: number
  y: number
  node: TreeNode
}

export default function Sidebar(): JSX.Element {
  const root = useVaultStore((s) => s.root)
  const addFolder = useVaultStore((s) => s.addFolder)
  const renameNode = useVaultStore((s) => s.renameNode)
  const deleteNode = useVaultStore((s) => s.deleteNode)
  const moveNode = useVaultStore((s) => s.moveNode)
  const lockVault = useVaultStore((s) => s.lockVault)
  const path = useVaultStore((s) => s.path)
  const pickExistingVault = useVaultStore((s) => s.pickExistingVault)
  const pickNewVaultLocation = useVaultStore((s) => s.pickNewVaultLocation)
  const openConnection = useSessionStore((s) => s.openConnection)

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [dialogState, setDialogState] = useState<{ parentId: string; conn?: ConnectionConfig } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['root']))
  const [promptState, setPromptState] = useState<
    { mode: 'new-folder'; parentId: string } | { mode: 'rename'; id: string; initial: string } | null
  >(null)

  useEffect(() => {
    function close(): void {
      setMenu(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  if (!root) return <div className={styles.wrap} />

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
        <span className={styles.vaultName} title={path}>
          {vaultDisplayName(path)}
        </span>
        <div className={styles.headerActions}>
          <button className={styles.lockBtn} title="Open a different vault…" onClick={() => pickExistingVault()}>
            📂
          </button>
          <button className={styles.lockBtn} title="Create a new vault…" onClick={() => pickNewVaultLocation()}>
            ＋
          </button>
          <button className={styles.lockBtn} title="Lock vault" onClick={() => lockVault()}>
            🔒
          </button>
        </div>
      </div>

      <div className={styles.tree}>
        {root.children.length === 0 && (
          <div className={styles.emptyHint}>Right-click here to add a folder or connection</div>
        )}
        {root.children.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
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
    </div>
  )
}

function SidebarContextMenu(props: {
  menu: ContextMenuState
  onClose: () => void
  onNewFolder: () => void
  onNewConnection: () => void
  onEdit?: () => void
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
