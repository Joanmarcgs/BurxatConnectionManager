import { useState } from 'react'
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

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLocalError(null)

    if (!vaultExists) {
      if (password.length < 6) {
        setLocalError('Master password must be at least 6 characters')
        return
      }
      if (password !== confirm) {
        setLocalError('Passwords do not match')
        return
      }
      setBusy(true)
      await createVault(password)
      setBusy(false)
      return
    }

    setBusy(true)
    await unlockVault(password)
    setBusy(false)
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Burxat's Connection Manager</h1>
        <p className={styles.subtitle}>
          {vaultExists
            ? `Enter the master password for "${vaultDisplayName(path)}"`
            : `Set a master password to create "${vaultDisplayName(path)}"`}
        </p>
        {path && <p className={styles.pathText}>{path}</p>}

        <label className={styles.label}>Master password</label>
        <input
          className={styles.input}
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {!vaultExists && (
          <>
            <label className={styles.label}>Confirm password</label>
            <input
              className={styles.input}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </>
        )}

        {(localError || error) && <div className={styles.error}>{localError ?? error}</div>}

        <button className={styles.button} type="submit" disabled={busy || !password}>
          {vaultExists ? 'Unlock' : 'Create vault'}
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
