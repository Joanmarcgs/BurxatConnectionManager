import { useSessionStore, type TabState } from '../../state/sessionStore'
import TerminalPane from './TerminalPane'
import TerminalStatusBar from './TerminalStatusBar'
import styles from './SessionView.module.css'

export default function SessionView({ tab, active }: { tab: TabState; active: boolean }): JSX.Element {
  const reconnectTab = useSessionStore((s) => s.reconnectTab)

  if (tab.status === 'error') {
    return (
      <div className={styles.errorWrap}>
        <p>Failed to connect to {tab.connection.host}</p>
        <p className={styles.errorMsg}>{tab.errorMessage}</p>
        <button className={styles.reconnectBtn} onClick={() => reconnectTab(tab.id)}>
          Reconnect
        </button>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.terminalArea}>
        <TerminalPane tab={tab} active={active} />
      </div>
      {tab.status === 'closed' && (
        <div className={styles.closedBanner}>
          <span>Session closed.</span>
          <button className={styles.reconnectBtn} onClick={() => reconnectTab(tab.id)}>
            Reconnect
          </button>
        </div>
      )}
      <TerminalStatusBar tab={tab} />
    </div>
  )
}
