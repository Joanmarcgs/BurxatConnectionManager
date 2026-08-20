import { useEffect, useState } from 'react'
import type { SftpEntry } from '../../../../shared/types'
import styles from './RemoteFolderPicker.module.css'

interface Props {
  sessionId: string
  startPath: string
  onSelect: (path: string) => void
  onClose: () => void
}

export default function RemoteFolderPicker({ sessionId, startPath, onSelect, onClose }: Props): JSX.Element {
  const [path, setPath] = useState(startPath)
  const [folders, setFolders] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    window.api.sftp
      .list(sessionId, path)
      .then((entries) => {
        if (cancelled) return
        setFolders(entries.filter((e) => e.isDirectory))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, path])

  function goUp(): void {
    const parts = path.split('/').filter(Boolean)
    parts.pop()
    setPath('/' + parts.join('/'))
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Choose destination folder</h2>

        <div className={styles.pathRow}>
          <button className={styles.upBtn} onClick={goUp} title="Up one level">
            ⬆
          </button>
          <span className={styles.pathText}>{path}</span>
        </div>

        <div className={styles.list}>
          {loading && <div className={styles.status}>Loading…</div>}
          {error && <div className={styles.error}>{error}</div>}
          {!loading &&
            !error &&
            folders.map((folder) => (
              <div key={folder.path} className={styles.folderRow} onDoubleClick={() => setPath(folder.path)}>
                📁 {folder.name}
              </div>
            ))}
          {!loading && !error && folders.length === 0 && <div className={styles.status}>No subfolders</div>}
        </div>

        <div className={styles.actions}>
          <button className={styles.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.primaryBtn} onClick={() => onSelect(path)}>
            Select this destination
          </button>
        </div>
      </div>
    </div>
  )
}
