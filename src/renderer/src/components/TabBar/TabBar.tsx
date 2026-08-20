import { useSessionStore } from '../../state/sessionStore'
import styles from './TabBar.module.css'

export default function TabBar(): JSX.Element {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const setActiveTab = useSessionStore((s) => s.setActiveTab)
  const closeTab = useSessionStore((s) => s.closeTab)

  if (tabs.length === 0) return <div className={styles.wrap} />

  return (
    <div className={styles.wrap}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`${styles.tab} ${tab.id === activeTabId ? styles.active : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className={`${styles.dot} ${styles[tab.status]}`} />
          <span className={styles.label}>{tab.connection.name}</span>
          <span
            className={styles.close}
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
          >
            ×
          </span>
        </div>
      ))}
    </div>
  )
}
