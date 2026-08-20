import type { SftpEntry } from '../../../../shared/types'
import styles from './SftpContextMenu.module.css'

interface Props {
  x: number
  y: number
  entry: SftpEntry
  onClose: () => void
  onRename: () => void
  onDownload: () => void
  onDelete: () => void
  onCopy: () => void
  onCopyMove: () => void
  onEdit: () => void
}

export default function SftpContextMenu(props: Props): JSX.Element {
  const { x, y, entry } = props

  function item(label: string, onClick: () => void, danger = false): JSX.Element {
    return (
      <div
        className={`${styles.menuItem} ${danger ? styles.menuItemDanger : ''}`}
        onClick={() => {
          onClick()
          props.onClose()
        }}
      >
        {label}
      </div>
    )
  }

  return (
    <div className={styles.menu} style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      {item('Rename', props.onRename)}
      {!entry.isDirectory && item('Download', props.onDownload)}
      {!entry.isDirectory && item('Make a copy', props.onCopy)}
      {!entry.isDirectory && item('Make a copy and move…', props.onCopyMove)}
      {!entry.isDirectory && item('Edit', props.onEdit)}
      {item('Delete', props.onDelete, true)}
    </div>
  )
}
