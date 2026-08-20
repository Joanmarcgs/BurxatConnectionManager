import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { TabState } from '../../state/sessionStore'
import { useSftpUiStore } from '../../state/sftpUiStore'
import SftpContextMenu from './SftpContextMenu'
import RemoteFolderPicker from './RemoteFolderPicker'
import PromptModal from '../common/PromptModal'
import type { EditSession, SftpEntry, SftpProgress } from '../../../../shared/types'
import styles from './SftpPane.module.css'

function autoCopyName(originalName: string): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  return `${originalName}_${date}_${time}.bak`
}

type ColumnKey = 'name' | 'size' | 'perms'

const CHECKBOX_COL_WIDTH = 28
const MIN_COL_WIDTH = 50
const DEFAULT_COL_WIDTHS: Record<ColumnKey, number> = { name: 220, size: 80, perms: 90 }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}

export default function SftpPane({ tab }: { tab: TabState }): JSX.Element {
  const [path, setPath] = useState('.')
  const [pathInput, setPathInput] = useState('.')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transfers, setTransfers] = useState<Map<string, SftpProgress>>(new Map())
  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COL_WIDTHS)
  const resizingCol = useRef<{ key: ColumnKey; startX: number; startWidth: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: SftpEntry } | null>(null)
  const [copyMoveEntry, setCopyMoveEntry] = useState<SftpEntry | null>(null)
  const [activeEdits, setActiveEdits] = useState<EditSession[]>([])
  const [promptState, setPromptState] = useState<
    | { mode: 'mkdir' }
    | { mode: 'rename'; entry: SftpEntry }
    | { mode: 'copy-move-name'; entry: SftpEntry; destDir: string }
    | null
  >(null)

  const onColResizeMove = useCallback((e: MouseEvent) => {
    const state = resizingCol.current
    if (!state) return
    const next = Math.max(MIN_COL_WIDTH, state.startWidth + (e.clientX - state.startX))
    setColWidths((prev) => ({ ...prev, [state.key]: next }))
  }, [])

  const stopColResize = useCallback(() => {
    resizingCol.current = null
    document.removeEventListener('mousemove', onColResizeMove)
    document.removeEventListener('mouseup', stopColResize)
    document.body.style.cursor = ''
  }, [onColResizeMove])

  const startColResize = useCallback(
    (key: ColumnKey) => (e: React.MouseEvent) => {
      e.preventDefault()
      resizingCol.current = { key, startX: e.clientX, startWidth: colWidths[key] }
      document.body.style.cursor = 'col-resize'
      document.addEventListener('mousemove', onColResizeMove)
      document.addEventListener('mouseup', stopColResize)
    },
    [colWidths, onColResizeMove, stopColResize]
  )

  const resetColWidths = useCallback(() => setColWidths(DEFAULT_COL_WIDTHS), [])

  const registerResetHandler = useSftpUiStore((s) => s.registerResetHandler)
  const unregisterResetHandler = useSftpUiStore((s) => s.unregisterResetHandler)
  const setCounts = useSftpUiStore((s) => s.setCounts)

  useEffect(() => {
    registerResetHandler(tab.id, resetColWidths)
    return () => unregisterResetHandler(tab.id)
  }, [tab.id, resetColWidths, registerResetHandler, unregisterResetHandler])

  useEffect(() => {
    const folders = entries.filter((e) => e.isDirectory).length
    setCounts(tab.id, { files: entries.length - folders, folders })
  }, [tab.id, entries, setCounts])

  useEffect(() => {
    function close(): void {
      setContextMenu(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  useEffect(() => {
    return window.api.sftp.onEditUploaded((event) => {
      if (!activeEdits.some((e) => e.editId === event.editId)) return
      if (event.error) setError(`Failed to sync "${event.fileName}": ${event.error}`)
      else refresh(path)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEdits, path])

  useEffect(() => {
    return window.api.sftp.onEditClosed((editId) => {
      setActiveEdits((prev) => prev.filter((e) => e.editId !== editId))
    })
  }, [])

  const refresh = useCallback(
    async (targetPath: string) => {
      if (tab.status !== 'connected') return
      setLoading(true)
      setError(null)
      try {
        const list = await window.api.sftp.list(tab.id, targetPath)
        setEntries(list)
        setSelected(new Set())
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [tab.id, tab.status]
  )

  useEffect(() => {
    if (tab.status !== 'connected') return
    window.api.sftp.home(tab.id).then((home) => {
      setPath(home)
      setPathInput(home)
      refresh(home)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.status])

  useEffect(() => {
    return window.api.sftp.onProgress((progress) => {
      if (progress.sessionId !== tab.id) return
      setTransfers((prev) => {
        const next = new Map(prev)
        if (progress.done) next.delete(progress.transferId)
        else next.set(progress.transferId, progress)
        return next
      })
      if (progress.done) refresh(path)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, path])

  function navigate(newPath: string): void {
    setPath(newPath)
    setPathInput(newPath)
    refresh(newPath)
  }

  function goUp(): void {
    const parts = path.split('/').filter(Boolean)
    parts.pop()
    navigate('/' + parts.join('/'))
  }

  function toggleSelect(entryPath: string, e: React.MouseEvent): void {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(entryPath)) next.delete(entryPath)
      else next.add(entryPath)
      return next
    })
  }

  async function handleUpload(): Promise<void> {
    const files = await window.api.dialogs.pickUploadFiles()
    for (const localPath of files) {
      const fileName = localPath.split(/[\\/]/).pop() ?? localPath
      const remotePath = path.endsWith('/') ? path + fileName : `${path}/${fileName}`
      const transferId = uuid()
      setTransfers((prev) =>
        new Map(prev).set(transferId, {
          sessionId: tab.id,
          transferId,
          direction: 'upload',
          fileName,
          bytesTransferred: 0,
          totalBytes: 1,
          done: false
        })
      )
      window.api.sftp.upload(tab.id, transferId, localPath, remotePath, fileName).catch((err) => setError(String(err)))
    }
  }

  async function handleDownload(): Promise<void> {
    if (selected.size === 0) return
    const dir = await window.api.dialogs.pickDownloadDir()
    if (!dir) return
    for (const entryPath of selected) {
      const entry = entries.find((e) => e.path === entryPath)
      if (!entry || entry.isDirectory) continue
      const localPath = `${dir}\\${entry.name}`
      const transferId = uuid()
      window.api.sftp
        .download(tab.id, transferId, entry.path, localPath, entry.name)
        .catch((err) => setError(String(err)))
    }
  }

  function handleMkdir(): void {
    setPromptState({ mode: 'mkdir' })
  }

  async function confirmMkdir(name: string): Promise<void> {
    const remotePath = path.endsWith('/') ? path + name : `${path}/${name}`
    try {
      await window.api.sftp.mkdir(tab.id, remotePath)
      refresh(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(): Promise<void> {
    if (selected.size === 0) return
    if (!window.confirm(`Delete ${selected.size} item(s)?`)) return
    for (const entryPath of selected) {
      const entry = entries.find((e) => e.path === entryPath)
      if (!entry) continue
      try {
        if (entry.isDirectory) await window.api.sftp.rmdir(tab.id, entry.path)
        else await window.api.sftp.unlink(tab.id, entry.path)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    refresh(path)
  }

  function handleRename(entry: SftpEntry): void {
    setPromptState({ mode: 'rename', entry })
  }

  async function confirmRename(entry: SftpEntry, name: string): Promise<void> {
    if (name === entry.name) return
    const parentPath = path.endsWith('/') ? path : path + '/'
    try {
      await window.api.sftp.rename(tab.id, entry.path, parentPath + name)
      refresh(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDeleteEntry(entry: SftpEntry): Promise<void> {
    if (!window.confirm(`Delete "${entry.name}"?`)) return
    try {
      if (entry.isDirectory) await window.api.sftp.rmdir(tab.id, entry.path)
      else await window.api.sftp.unlink(tab.id, entry.path)
      refresh(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDownloadEntry(entry: SftpEntry): Promise<void> {
    const dir = await window.api.dialogs.pickDownloadDir()
    if (!dir) return
    const transferId = uuid()
    window.api.sftp
      .download(tab.id, transferId, entry.path, `${dir}\\${entry.name}`, entry.name)
      .catch((err) => setError(String(err)))
  }

  async function handleCopy(entry: SftpEntry): Promise<void> {
    const parentPath = path.endsWith('/') ? path : path + '/'
    const destPath = parentPath + autoCopyName(entry.name)
    try {
      await window.api.sftp.copy(tab.id, entry.path, destPath)
      refresh(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleCopyMove(entry: SftpEntry): void {
    setCopyMoveEntry(entry)
  }

  function confirmCopyMove(destDir: string): void {
    const entry = copyMoveEntry
    setCopyMoveEntry(null)
    if (!entry) return
    setPromptState({ mode: 'copy-move-name', entry, destDir })
  }

  async function executeCopyMove(entry: SftpEntry, destDir: string, name: string): Promise<void> {
    const destPath = destDir.endsWith('/') ? destDir + name : `${destDir}/${name}`
    try {
      await window.api.sftp.copy(tab.id, entry.path, destPath)
      if (destDir === path) refresh(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleEdit(entry: SftpEntry): Promise<void> {
    try {
      const editSession = await window.api.sftp.editStart(tab.id, entry.path)
      setActiveEdits((prev) => [...prev, editSession])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleStopEdit(editId: string): Promise<void> {
    await window.api.sftp.editStop(editId)
    setActiveEdits((prev) => prev.filter((e) => e.editId !== editId))
  }

  if (tab.status !== 'connected') {
    return <div className={styles.wrap}><div className={styles.status}>Waiting for connection…</div></div>
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <button className={styles.btn} onClick={goUp} title="Up one level">
            ⬆
          </button>
          <form
            className={styles.pathForm}
            onSubmit={(e) => {
              e.preventDefault()
              navigate(pathInput)
            }}
          >
            <input className={styles.pathInput} value={pathInput} onChange={(e) => setPathInput(e.target.value)} />
          </form>
          <button className={styles.btn} onClick={() => refresh(path)} title="Refresh">
            ⟳
          </button>
        </div>
        <div className={styles.toolbarRow}>
          <button className={styles.btn} onClick={handleUpload} title="Upload files">
            ⬆ Upload
          </button>
          <button className={styles.btn} onClick={handleDownload} disabled={selected.size === 0} title="Download selected">
            ⬇ Download
          </button>
          <button className={styles.btn} onClick={handleMkdir} title="New folder">
            + Folder
          </button>
          <button className={styles.btn} onClick={handleDelete} disabled={selected.size === 0} title="Delete selected">
            Delete
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {transfers.size > 0 && (
        <div className={styles.transfers}>
          {Array.from(transfers.values()).map((t) => (
            <div key={t.transferId} className={styles.transfer}>
              <span>
                {t.direction === 'upload' ? '⬆' : '⬇'} {t.fileName}
              </span>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.min(100, (t.bytesTransferred / Math.max(1, t.totalBytes)) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.tableWrap}>
        {loading && <div className={styles.status}>Loading…</div>}
        {!loading && (
          <table
            className={styles.table}
            style={{ width: CHECKBOX_COL_WIDTH + colWidths.name + colWidths.size + colWidths.perms }}
          >
            <colgroup>
              <col style={{ width: CHECKBOX_COL_WIDTH }} />
              <col style={{ width: colWidths.name }} />
              <col style={{ width: colWidths.size }} />
              <col style={{ width: colWidths.perms }} />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th className={styles.resizableTh}>
                  Name
                  <span className={styles.colResizeHandle} onMouseDown={startColResize('name')} />
                </th>
                <th className={styles.resizableTh}>
                  Size
                  <span className={styles.colResizeHandle} onMouseDown={startColResize('size')} />
                </th>
                <th className={styles.resizableTh}>
                  Perms
                  <span className={styles.colResizeHandle} onMouseDown={startColResize('perms')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.path}
                  className={selected.has(entry.path) ? styles.rowSelected : ''}
                  onDoubleClick={() => (entry.isDirectory ? navigate(entry.path) : undefined)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setContextMenu({ x: e.clientX, y: e.clientY, entry })
                  }}
                >
                  <td onClick={(e) => toggleSelect(entry.path, e)}>
                    <input type="checkbox" checked={selected.has(entry.path)} readOnly />
                  </td>
                  <td onClick={(e) => toggleSelect(entry.path, e)}>
                    {entry.isDirectory ? '📁' : '📄'} {entry.name}
                  </td>
                  <td>{entry.isDirectory ? '' : formatSize(entry.size)}</td>
                  <td className={styles.perms}>{entry.permissions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {activeEdits.length > 0 && (
        <div className={styles.edits}>
          {activeEdits.map((e) => (
            <div key={e.editId} className={styles.editChip}>
              <span>✎ {e.fileName} (auto-syncs on save)</span>
              <button className={styles.editStopBtn} onClick={() => handleStopEdit(e.editId)}>
                Stop
              </button>
            </div>
          ))}
        </div>
      )}

      {contextMenu && (
        <SftpContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          onClose={() => setContextMenu(null)}
          onRename={() => handleRename(contextMenu.entry)}
          onDownload={() => handleDownloadEntry(contextMenu.entry)}
          onDelete={() => handleDeleteEntry(contextMenu.entry)}
          onCopy={() => handleCopy(contextMenu.entry)}
          onCopyMove={() => handleCopyMove(contextMenu.entry)}
          onEdit={() => handleEdit(contextMenu.entry)}
        />
      )}

      {copyMoveEntry && (
        <RemoteFolderPicker
          sessionId={tab.id}
          startPath={path}
          onClose={() => setCopyMoveEntry(null)}
          onSelect={confirmCopyMove}
        />
      )}

      {promptState && promptState.mode === 'mkdir' && (
        <PromptModal
          title="New folder"
          label="Folder name"
          confirmLabel="Create"
          onCancel={() => setPromptState(null)}
          onSubmit={(name) => {
            confirmMkdir(name)
            setPromptState(null)
          }}
        />
      )}

      {promptState && promptState.mode === 'rename' && (
        <PromptModal
          title="Rename"
          label="New name"
          initialValue={promptState.entry.name}
          confirmLabel="Rename"
          onCancel={() => setPromptState(null)}
          onSubmit={(name) => {
            confirmRename(promptState.entry, name)
            setPromptState(null)
          }}
        />
      )}

      {promptState && promptState.mode === 'copy-move-name' && (
        <PromptModal
          title="Copy as"
          label="File name"
          initialValue={autoCopyName(promptState.entry.name)}
          confirmLabel="Copy"
          onCancel={() => setPromptState(null)}
          onSubmit={(name) => {
            executeCopyMove(promptState.entry, promptState.destDir, name)
            setPromptState(null)
          }}
        />
      )}
    </div>
  )
}
