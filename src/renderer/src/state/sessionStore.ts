import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { ConnectionConfig } from '../../../shared/types'

export interface TabState {
  id: string
  connection: ConnectionConfig
  status: 'connecting' | 'connected' | 'error' | 'closed'
  errorMessage?: string
}

interface SessionState {
  tabs: TabState[]
  activeTabId: string | null

  openConnection: (connection: ConnectionConfig) => Promise<string>
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  setStatus: (id: string, status: TabState['status'], message?: string) => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openConnection: async (connection) => {
    const id = uuid()
    const tab: TabState = { id, connection, status: 'connecting' }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))

    try {
      await window.api.session.connect(id, connection)
    } catch (err) {
      get().setStatus(id, 'error', err instanceof Error ? err.message : String(err))
    }
    return id
  },

  closeTab: (id) => {
    window.api.session.disconnect(id)
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeTabId = s.activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId
      return { tabs, activeTabId }
    })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  setStatus: (id, status, message) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, status, errorMessage: message } : t))
    }))
}))

// Wire the single global status listener once.
window.api.session.onStatus((status) => {
  useSessionStore.getState().setStatus(status.sessionId, status.status, status.message)
})

// Stats polling should only run for the session that's both the active tab and in a focused
// window — nothing else has a reason to keep waking the network every few seconds. Re-evaluate
// on every store change (tab switch, connect/disconnect) and on window focus/blur, and tell main
// only when the answer actually changes.
let pollingSessionId: string | null = null

function updateStatsPolling(): void {
  const { tabs, activeTabId } = useSessionStore.getState()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const shouldPollId = document.hasFocus() && activeTab?.status === 'connected' ? activeTab.id : null

  if (shouldPollId === pollingSessionId) return
  if (pollingSessionId) window.api.session.setActive(pollingSessionId, false)
  if (shouldPollId) window.api.session.setActive(shouldPollId, true)
  pollingSessionId = shouldPollId
}

useSessionStore.subscribe(updateStatsPolling)
window.addEventListener('focus', updateStatsPolling)
window.addEventListener('blur', updateStatsPolling)
