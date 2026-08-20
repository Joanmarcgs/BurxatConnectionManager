import type { ConnectionConfig, TreeNode } from '../../../../shared/types'
import styles from './Sidebar.module.css'

interface TreeItemProps {
  node: TreeNode
  depth: number
  expanded: Set<string>
  onToggleExpand: (id: string) => void
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
  onConnect: (conn: ConnectionConfig) => void
  onMove: (nodeId: string, newParentId: string) => void
}

export default function TreeItem(props: TreeItemProps): JSX.Element {
  const { node, depth, expanded, onToggleExpand, onContextMenu, onConnect, onMove } = props
  const isFolder = node.type === 'folder'
  const isOpen = expanded.has(node.id)

  function handleDragStart(e: React.DragEvent): void {
    e.dataTransfer.setData('text/node-id', node.id)
  }

  function handleDragOver(e: React.DragEvent): void {
    if (isFolder) e.preventDefault()
  }

  function handleDrop(e: React.DragEvent): void {
    if (!isFolder) return
    e.preventDefault()
    e.stopPropagation()
    const draggedId = e.dataTransfer.getData('text/node-id')
    if (draggedId) onMove(draggedId, node.id)
  }

  return (
    <div>
      <div
        className={styles.node}
        style={{ paddingLeft: 10 + depth * 14 }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onContextMenu={(e) => onContextMenu(e, node)}
        onClick={() => (isFolder ? onToggleExpand(node.id) : undefined)}
        onDoubleClick={() => (!isFolder ? onConnect(node as ConnectionConfig) : undefined)}
      >
        <span className={styles.icon}>
          {isFolder ? (isOpen ? '📂' : '📁') : (node as ConnectionConfig).protocol === 'rdp' ? '🖵' : '🖥️'}
        </span>
        <span className={styles.label}>{node.name}</span>
      </div>

      {isFolder && isOpen && (
        <div>
          {node.children.length === 0 && (
            <div className={styles.emptyHint} style={{ paddingLeft: 24 + depth * 14 }}>
              Empty
            </div>
          )}
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onContextMenu={onContextMenu}
              onConnect={onConnect}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
