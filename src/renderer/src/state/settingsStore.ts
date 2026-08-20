import { create } from 'zustand'
import type { AppSettings } from '../../../shared/types'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<void>
}

function applyTheme(theme: AppSettings['theme']): void {
  document.documentElement.dataset.theme = theme
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { defaultEditor: 'system', theme: 'dark' },
  loaded: false,

  load: async () => {
    const settings = await window.api.settings.get()
    applyTheme(settings.theme)
    set({ settings, loaded: true })
  },

  update: async (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    applyTheme(next.theme)
    await window.api.settings.set(next)
  }
}))
