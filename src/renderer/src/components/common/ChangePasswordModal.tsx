import { useState } from 'react'
import { useVaultStore } from '../../state/vaultStore'
import styles from './ChangePasswordModal.module.css'

export default function ChangePasswordModal({ onClose }: { onClose: () => void }): JSX.Element {
  const changeVaultPassword = useVaultStore((s) => s.changeVaultPassword)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const noNewPassword = newPassword.length === 0

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirm) {
      setError('New passwords do not match')
      return
    }
    setBusy(true)
    const result = await changeVaultPassword(currentPassword, newPassword)
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'Failed to change password')
      return
    }
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form className={styles.card} onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className={styles.title}>Change master password</h2>

        <label className={styles.label}>Current password</label>
        <input
          className={styles.input}
          type="password"
          autoFocus
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />

        <label className={styles.label}>New password (optional)</label>
        <input
          className={styles.input}
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        <label className={styles.label}>Confirm new password</label>
        <input
          className={styles.input}
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {noNewPassword && (
          <div className={styles.warning}>
            ⚠ Leaving this blank removes the password entirely — anyone who can open this file
            will be able to read every saved connection, password, and private key inside it.
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={busy}>
            {busy ? 'Changing…' : noNewPassword ? 'Remove password' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  )
}
