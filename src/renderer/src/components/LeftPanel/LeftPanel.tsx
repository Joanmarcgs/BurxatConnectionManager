import { useCallback, useRef, useState } from 'react'
import Sidebar from '../Sidebar/Sidebar'
import SftpPane from '../SessionView/SftpPane'
import SettingsModal from '../Settings/SettingsModal'
import { useSessionStore } from '../../state/sessionStore'
import { useSftpUiStore } from '../../state/sftpUiStore'
import { useVaultStore } from '../../state/vaultStore'
import { vaultDisplayName } from '../../utils/vaultName'
import styles from './LeftPanel.module.css'

type LeftTab = 'connections' | 'sftp'

const MIN_WIDTH = 260
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 340

export default function LeftPanel(): JSX.Element {
  const [activeLeftTab, setActiveLeftTab] = useState<LeftTab>('connections')
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const resizing = useRef(false)
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const counts = useSftpUiStore((s) => (activeTabId ? s.counts[activeTabId] : undefined))
  const triggerReset = useSftpUiStore((s) => s.triggerReset)
  const vaultPath = useVaultStore((s) => s.path)

  const onResizeMove = useCallback((e: MouseEvent) => {
    if (!resizing.current) return
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)))
  }, [])

  const stopResizing = useCallback(() => {
    resizing.current = false
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', stopResizing)
    document.body.style.cursor = ''
  }, [onResizeMove])

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizing.current = true
      document.body.style.cursor = 'col-resize'
      document.addEventListener('mousemove', onResizeMove)
      document.addEventListener('mouseup', stopResizing)
    },
    [onResizeMove, stopResizing]
  )

  return (
    <div className={styles.wrap} style={{ width, minWidth: width }}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeLeftTab === 'connections' ? styles.tabActive : ''}`}
          onClick={() => setActiveLeftTab('connections')}
          title={vaultPath}
        >
          {vaultDisplayName(vaultPath)}
        </button>
        <button
          className={`${styles.tab} ${activeLeftTab === 'sftp' ? styles.tabActive : ''}`}
          onClick={() => setActiveLeftTab('sftp')}
        >
          SFTP
        </button>
        <button className={styles.gearBtn} title="Settings" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      <div className={styles.body}>
        <div style={{ display: activeLeftTab === 'connections' ? 'flex' : 'none', height: '100%' }}>
          <Sidebar />
        </div>

        <div style={{ display: activeLeftTab === 'sftp' ? 'flex' : 'none', height: '100%' }}>
          {tabs.length === 0 && <div className={styles.empty}>No active connection</div>}
          {tabs.map((tab) => (
            <div key={tab.id} style={{ display: tab.id === activeTabId ? 'flex' : 'none', height: '100%', width: '100%' }}>
              <SftpPane tab={tab} />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.statusBar}>
        {activeLeftTab === 'sftp' && activeTabId && counts && (
          <>
            <span className={styles.statusText}>
              {counts.files} file{counts.files === 1 ? '' : 's'}, {counts.folders} folder
              {counts.folders === 1 ? '' : 's'}
            </span>
            <button className={styles.resetBtn} onClick={() => triggerReset(activeTabId)}>
              Reset Columns
            </button>
          </>
        )}
      </div>

      <div className={styles.resizeHandle} onMouseDown={startResizing} />
    </div>
  )
}
