import LeftPanel from '../LeftPanel/LeftPanel'
import TabBar from '../TabBar/TabBar'
import SessionView from '../SessionView/SessionView'
import { useSessionStore } from '../../state/sessionStore'
import styles from './MainLayout.module.css'

export default function MainLayout(): JSX.Element {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div className={styles.wrap}>
      <LeftPanel />
      <div className={styles.right}>
        <TabBar />
        <div className={styles.content}>
          {tabs.map((tab) => (
            <div key={tab.id} style={{ display: tab.id === activeTabId ? 'flex' : 'none', height: '100%' }}>
              <SessionView tab={tab} active={tab.id === activeTabId} />
            </div>
          ))}
          {!activeTab && (
            <div className={styles.empty}>
              <p>Select a connection from the sidebar, or create a new one.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
