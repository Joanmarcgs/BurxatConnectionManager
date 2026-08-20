import type { TabState } from '../../state/sessionStore'
import TerminalPane from './TerminalPane'
import TerminalStatusBar from './TerminalStatusBar'
import styles from './SessionView.module.css'

export default function SessionView({ tab, active }: { tab: TabState; active: boolean }): JSX.Element {
  if (tab.status === 'error') {
    return (
      <div className={styles.errorWrap}>
        <p>Failed to connect to {tab.connection.host}</p>
        <p className={styles.errorMsg}>{tab.errorMessage}</p>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.terminalArea}>
        <TerminalPane tab={tab} active={active} />
      </div>
      <TerminalStatusBar tab={tab} />
    </div>
  )
}
