import { useEffect, useState } from 'react'
import { useVaultStore } from '../../state/vaultStore'
import { vaultDisplayName } from '../../utils/vaultName'
import styles from './VaultUnlock.module.css'

export default function VaultUnlock(): JSX.Element {
  const vaultExists = useVaultStore((s) => s.vaultExists)
  const path = useVaultStore((s) => s.path)
  const error = useVaultStore((s) => s.error)
  const createVault = useVaultStore((s) => s.createVault)
  const unlockVault = useVaultStore((s) => s.unlockVault)
  const pickExistingVault = useVaultStore((s) => s.pickExistingVault)
  const pickNewVaultLocation = useVaultStore((s) => s.pickNewVaultLocation)

  // No vault found at the current path (first launch, or the last-used vault file went missing):
  // lead with a choice instead of dropping straight into a password form. `showCreateForm` is
  // only consulted while `!vaultExists` — the moment a real vault is found (fresh create, or
  // picking an existing file), the unlock form below takes over regardless of this flag.
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (vaultExists) setShowCreateForm(false)
  }, [vaultExists])

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLocalError(null)
    if (password !== confirm) {
      setLocalError('Passwords do not match')
      return
    }
    setBusy(true)
    await createVault(password)
    setBusy(false)
  }

  async function handleUnlock(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLocalError(null)
    setBusy(true)
    await unlockVault(password)
    setBusy(false)
  }

  if (!vaultExists && !showCreateForm) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>Burxat's Connection Manager</h1>
          <p className={styles.subtitle}>
            No vault found at the default location. Create a new one, or open one you already
            have.
          </p>
          {path && <p className={styles.pathText}>{path}</p>}

          <div className={styles.chooserGrid}>
            <button
              type="button"
              className={styles.chooserBtn}
              onClick={() => {
                setPassword('')
                setConfirm('')
                setLocalError(null)
                setShowCreateForm(true)
              }}
            >
              <span className={styles.chooserIcon}>＋</span>
              <span className={styles.chooserLabel}>Create a new vault</span>
            </button>
            <button type="button" className={styles.chooserBtn} onClick={pickExistingVault}>
              <span className={styles.chooserIcon}>📂</span>
              <span className={styles.chooserLabel}>Open an existing vault</span>
            </button>
          </div>

          {error && <div className={styles.error}>{error}</div>}
        </div>
      </div>
    )
  }

  if (!vaultExists && showCreateForm) {
    const noPassword = password.length === 0

    return (
      <div className={styles.wrap}>
        <form className={styles.card} onSubmit={handleCreate}>
          <h1 className={styles.title}>Create a new vault</h1>
          <p className={styles.subtitle}>{`This will create "${vaultDisplayName(path)}"`}</p>
          {path && <p className={styles.pathText}>{path}</p>}

          <label className={styles.label}>Master password (optional)</label>
          <input
            className={styles.input}
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label className={styles.label}>Confirm password</label>
          <input
            className={styles.input}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {noPassword && (
            <div className={styles.warning}>
              ⚠ No password set — anyone who can open this file will be able to read every saved
              connection, password, and private key inside it. Only skip the password if you
              understand and accept that risk.
            </div>
          )}

          {(localError || error) && <div className={styles.error}>{localError ?? error}</div>}

          <button className={styles.button} type="submit" disabled={busy}>
            {noPassword ? 'Create vault without a password' : 'Create vault'}
          </button>

          <div className={styles.switchRow}>
            <button type="button" className={styles.linkBtn} onClick={() => setShowCreateForm(false)}>
              ← Back
            </button>
            <button type="button" className={styles.linkBtn} onClick={pickNewVaultLocation}>
              Choose a different location…
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={handleUnlock}>
        <h1 className={styles.title}>Burxat's Connection Manager</h1>
        <p className={styles.subtitle}>{`Enter the master password for "${vaultDisplayName(path)}"`}</p>
        {path && <p className={styles.pathText}>{path}</p>}

        <label className={styles.label}>Master password</label>
        <input
          className={styles.input}
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {(localError || error) && <div className={styles.error}>{localError ?? error}</div>}

        <button className={styles.button} type="submit" disabled={busy}>
          Unlock
        </button>

        <div className={styles.switchRow}>
          <button type="button" className={styles.linkBtn} onClick={pickExistingVault}>
            Open a different vault…
          </button>
          <button type="button" className={styles.linkBtn} onClick={pickNewVaultLocation}>
            Create a new vault…
          </button>
        </div>
      </form>
    </div>
  )
}
