import { useEffect, useState } from 'react'
import { useSettingsStore } from '../../state/settingsStore'
import type { VaultAssociationStatus } from '../../../../shared/types'
import styles from './SettingsModal.module.css'

export default function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)

  const [useCustomEditor, setUseCustomEditor] = useState(settings.defaultEditor !== 'system')
  const [editorPath, setEditorPath] = useState(settings.defaultEditor === 'system' ? '' : settings.defaultEditor)
  const [version, setVersion] = useState('')
  const [association, setAssociation] = useState<VaultAssociationStatus | null>(null)
  const [associationBusy, setAssociationBusy] = useState(false)

  useEffect(() => {
    window.api.app.getVersion().then(setVersion)
    window.api.app.getVaultAssociation().then(setAssociation)
  }, [])

  async function registerAssociation(): Promise<void> {
    setAssociationBusy(true)
    setAssociation(await window.api.app.registerVaultAssociation())
    setAssociationBusy(false)
  }

  async function pickEditor(): Promise<void> {
    const path = await window.api.dialogs.pickEditorPath()
    if (path) setEditorPath(path)
  }

  async function handleSave(): Promise<void> {
    await update({ defaultEditor: useCustomEditor && editorPath ? editorPath : 'system' })
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Settings</h2>

        <div className={styles.section}>
          <label className={styles.label}>Theme</label>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${settings.theme === 'dark' ? styles.tabActive : ''}`}
              onClick={() => update({ theme: 'dark' })}
            >
              Dark
            </button>
            <button
              className={`${styles.tab} ${settings.theme === 'light' ? styles.tabActive : ''}`}
              onClick={() => update({ theme: 'light' })}
            >
              Light
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Terminal style</label>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${settings.terminalStyle === 'default' ? styles.tabActive : ''}`}
              onClick={() => update({ terminalStyle: 'default' })}
            >
              Default (colored)
            </button>
            <button
              className={`${styles.tab} ${settings.terminalStyle === 'raw' ? styles.tabActive : ''}`}
              onClick={() => update({ terminalStyle: 'raw' })}
            >
              Raw
            </button>
          </div>
          <p className={styles.hint}>
            Default highlights IPs, MAC addresses, URLs, UUIDs, and a few status words (error/
            warning/success) in plain command output — never touching lines that already contain
            color codes of their own (colored `ls`, prompts, vim, htop, etc.). Raw disables that
            and shows exactly what the remote shell sends.
          </p>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Default editor (for SFTP "Edit")</label>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${!useCustomEditor ? styles.tabActive : ''}`}
              onClick={() => setUseCustomEditor(false)}
            >
              System default
            </button>
            <button
              className={`${styles.tab} ${useCustomEditor ? styles.tabActive : ''}`}
              onClick={() => setUseCustomEditor(true)}
            >
              Custom editor
            </button>
          </div>

          {useCustomEditor && (
            <div className={styles.editorRow}>
              <input
                className={styles.input}
                value={editorPath}
                readOnly
                placeholder="No editor selected"
              />
              <button className={styles.secondaryBtn} onClick={pickEditor}>
                Browse…
              </button>
            </div>
          )}
        </div>

        <div className={styles.section}>
          <label className={styles.label}>View</label>
          <div className={styles.grid}>
            <button className={styles.gridBtn} onClick={() => window.api.view.reload()}>
              Reload
            </button>
            <button className={styles.gridBtn} onClick={() => window.api.view.forceReload()}>
              Force reload
            </button>
            <button className={styles.gridBtn} onClick={() => window.api.view.toggleDevTools()}>
              Toggle DevTools
            </button>
            <button className={styles.gridBtn} onClick={() => window.api.view.toggleFullScreen()}>
              Full screen
            </button>
            <button className={styles.gridBtn} onClick={() => window.api.view.zoomOut()}>
              Zoom −
            </button>
            <button className={styles.gridBtn} onClick={() => window.api.view.resetZoom()}>
              Reset zoom
            </button>
            <button className={styles.gridBtn} onClick={() => window.api.view.zoomIn()}>
              Zoom +
            </button>
          </div>
        </div>

        {association?.supported && (
          <div className={styles.section}>
            <label className={styles.label}>Open .vault files by double-clicking</label>
            <p className={styles.hint}>
              {association.state === 'ok' && '✓ Double-clicking a .vault file opens this copy of the app.'}
              {association.state === 'unregistered' && "Not set up yet: double-clicking a .vault file won't open this app."}
              {association.state === 'stale' &&
                `Set up, but pointing at a different location (${association.registeredPath}). Update it to this copy.`}
              {association.state === 'other-app' &&
                `Another program currently opens .vault files (${association.registeredPath}). You can still register this app, then pick it in Windows' Default apps.`}
              <br />
              This copy: {association.exePath}
            </p>
            <button className={styles.secondaryBtn} onClick={registerAssociation} disabled={associationBusy}>
              {association.state === 'ok' ? 'Register again' : 'Set up for this location'}
            </button>
            <p className={styles.hint}>
              Only changes this Windows user's file type settings. The first time, Windows may ask you to
              confirm the app once ("Always"). If you move this folder, come back here and update it.
            </p>
          </div>
        )}

        <div className={styles.section}>
          <label className={styles.label}>Help &amp; About</label>
          <p className={styles.hint}>
            Burxat's Connection Manager{version ? ` v${version}` : ''}
            <br />
            A portable SSH/RDP/SFTP client.
          </p>
        </div>

        <div className={styles.actions}>
          <button className={styles.secondaryBtn} onClick={onClose}>
            Close
          </button>
          <button className={styles.primaryBtn} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
