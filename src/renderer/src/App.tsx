import { useEffect } from 'react'
import { useVaultStore } from './state/vaultStore'
import { useSettingsStore } from './state/settingsStore'
import VaultUnlock from './components/VaultUnlock/VaultUnlock'
import MainLayout from './components/MainLayout/MainLayout'

export default function App(): JSX.Element {
  const unlocked = useVaultStore((s) => s.unlocked)
  const refreshStatus = useVaultStore((s) => s.refreshStatus)
  const loadSettings = useSettingsStore((s) => s.load)

  useEffect(() => {
    refreshStatus()
    loadSettings()
  }, [refreshStatus, loadSettings])

  return unlocked ? <MainLayout /> : <VaultUnlock />
}
