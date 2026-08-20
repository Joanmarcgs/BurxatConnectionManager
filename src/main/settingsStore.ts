import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { resolveDataDir } from './vaultPath'
import type { AppSettings } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  defaultEditor: 'system',
  theme: 'dark'
}

function settingsFilePath(): string {
  const dir = resolveDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'settings.json')
}

export function getSettings(): AppSettings {
  const path = settingsFilePath()
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): void {
  writeFileSync(settingsFilePath(), JSON.stringify(settings, null, 2), 'utf-8')
}
