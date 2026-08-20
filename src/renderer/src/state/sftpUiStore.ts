import { create } from 'zustand'

interface SftpCounts {
  files: number
  folders: number
}

interface SftpUiState {
  counts: Record<string, SftpCounts>
  resetHandlers: Record<string, () => void>

  setCounts: (sessionId: string, counts: SftpCounts) => void
  registerResetHandler: (sessionId: string, handler: () => void) => void
  unregisterResetHandler: (sessionId: string) => void
  triggerReset: (sessionId: string) => void
}

export const useSftpUiStore = create<SftpUiState>((set, get) => ({
  counts: {},
  resetHandlers: {},

  setCounts: (sessionId, counts) =>
    set((s) => ({ counts: { ...s.counts, [sessionId]: counts } })),

  registerResetHandler: (sessionId, handler) =>
    set((s) => ({ resetHandlers: { ...s.resetHandlers, [sessionId]: handler } })),

  unregisterResetHandler: (sessionId) =>
    set((s) => {
      const next = { ...s.resetHandlers }
      delete next[sessionId]
      return { resetHandlers: next }
    }),

  triggerReset: (sessionId) => get().resetHandlers[sessionId]?.()
}))
