import { useEffect, useState } from 'react'
import { useVaultStore } from '../../state/vaultStore'
import { vaultDisplayName } from '../../utils/vaultName'
import styles from './VaultUnlock.module.css'

export default function VaultUnlock(): JSX.Element {
  const vaultExists = useVaultStore((s) => s.vaultExists)
  const path = useVaultStore((s) => s.path)
  const error = useVaultStore((s) => s.error)
  const intentCreateNew = useVaultStore((s) => s.intentCreateNew)
  const clearIntentCreateNew = useVaultStore((s) => s.clearIntentCreateNew)
  const createVaultWithDialog = useVaultStore((s) => s.createVaultWithDialog)
  const unlockVault = useVaultStore((s) => s.unlockVault)
  const pickExistingVault = useVaultStore((s) => s.pickExistingVault)

  // `forceCreate` captures a one-shot request (from the header menu's "Create a new vault",
  // while a different vault was already open) to jump straight into the create form once this
  // component (re)mounts, instead of falling back to the unlock screen for the vault that was
  // just locked. `vaultExists` itself is read live on every render below so that it still
  // correctly reacts to the async status check resolving after mount, or to picking an existing
  // vault file.
  const [forceCreate, setForceCreate] = useState(intentCreateNew)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (intentCreateNew) clearIntentCreateNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resetCreateForm(): void {
    setName('')
    setDescription('')
    setPassword('')
    setConfirm('')
    setLocalError(null)
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLocalError(null)
    if (!name.trim()) {
      setLocalError('Name is required')
      return
    }
    if (password !== confirm) {
      setLocalError('Passwords do not match')
      return
    }
    setBusy(true)
    await createVaultWithDialog(name.trim(), description.trim(), password)
    setBusy(false)
  }

  async function handleUnlock(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLocalError(null)
    setBusy(true)
    await unlockVault(password)
    setBusy(false)
  }

  async function handlePickExisting(): Promise<void> {
    await pickExistingVault()
  }

  const showCreate = forceCreate || (!vaultExists && showCreateForm)

  if (!forceCreate && !vaultExists && !showCreateForm) {
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
                resetCreateForm()
                setShowCreateForm(true)
              }}
            >
              <span className={styles.chooserIcon}>＋</span>
              <span className={styles.chooserLabel}>Create a new vault</span>
            </button>
            <button type="button" className={styles.chooserBtn} onClick={handlePickExisting}>
              <span className={styles.chooserIcon}>📂</span>
              <span className={styles.chooserLabel}>Open an existing vault</span>
            </button>
          </div>

          {error && <div className={styles.error}>{error}</div>}
        </div>
      </div>
    )
  }

  if (showCreate) {
    const noPassword = password.length === 0

    return (
      <div className={styles.wrap}>
        <form className={styles.card} onSubmit={handleCreate}>
          <h1 className={styles.title}>Create a new vault</h1>
          <p className={styles.subtitle}>
            Choose where to save it once you confirm below.
          </p>

          <label className={styles.label}>Name</label>
          <input
            className={styles.input}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className={styles.label}>Description (optional)</label>
          <input
            className={styles.input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label className={styles.label}>Master password (optional)</label>
          <input
            className={styles.input}
            type="password"
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

          <button className={styles.button} type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : noPassword ? 'Create vault without a password' : 'Create vault'}
          </button>

          <div className={styles.switchRow}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setForceCreate(false)
                setShowCreateForm(false)
              }}
            >
              ← Back
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

        <div className={styles.buttonRow}>
          <button type="button" className={styles.secondaryBtn} onClick={handlePickExisting}>
            📂 Open a different vault
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              resetCreateForm()
              setForceCreate(true)
            }}
          >
            ＋ Create a new vault
          </button>
        </div>
      </form>
    </div>
  )
}
