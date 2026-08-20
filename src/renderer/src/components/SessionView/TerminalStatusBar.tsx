import { useEffect, useState } from 'react'
import type { TabState } from '../../state/sessionStore'
import type { ServerStats } from '../../../../shared/types'
import styles from './TerminalStatusBar.module.css'

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.round(mb)} MB`
}

export default function TerminalStatusBar({ tab }: { tab: TabState }): JSX.Element {
  const [stats, setStats] = useState<ServerStats | null>(null)

  useEffect(() => {
    setStats(null)
    return window.api.session.onStats((s) => {
      if (s.sessionId === tab.id) setStats(s)
    })
  }, [tab.id])

  if (tab.status !== 'connected') {
    return <div className={styles.bar} />
  }

  if (!stats) {
    return (
      <div className={styles.bar}>
        <span className={styles.item}>Gathering server stats…</span>
      </div>
    )
  }

  const memPercent = stats.memTotalMB > 0 ? (stats.memUsedMB / stats.memTotalMB) * 100 : 0

  return (
    <div className={styles.bar}>
      <span className={styles.item}>
        CPU: {stats.cpuPercent === null ? '—' : `${Math.round(stats.cpuPercent)}%`}
      </span>
      <span className={styles.item}>
        RAM: {formatMB(stats.memUsedMB)} / {formatMB(stats.memTotalMB)} ({Math.round(memPercent)}%)
      </span>
      <span className={styles.platform}>{stats.platform === 'unix' ? 'Unix' : 'Windows'}</span>
    </div>
  )
}
