import { useEffect, useRef, useState } from 'react'
import styles from './PromptModal.module.css'

interface Props {
  title: string
  label?: string
  initialValue?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

// Electron doesn't implement window.prompt() (it returns null immediately with no dialog),
// so anything that needs a single text input from the user goes through this instead.
export default function PromptModal({
  title,
  label,
  initialValue = '',
  confirmLabel = 'OK',
  onSubmit,
  onCancel
}: Props): JSX.Element {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <form className={styles.card} onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className={styles.title}>{title}</h2>
        {label && <label className={styles.label}>{label}</label>}
        <input
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
