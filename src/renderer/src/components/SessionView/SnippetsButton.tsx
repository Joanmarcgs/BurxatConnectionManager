import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { Snippet } from '../../../../shared/types'
import styles from './SnippetsButton.module.css'

/** Status-bar button: lists the vault's saved commands and runs one in the current terminal. */
export default function SnippetsButton({ sessionId }: { sessionId: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) window.api.vault.getSnippets().then(setSnippets)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent): void {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  function run(snippet: Snippet): void {
    // A carriage return is what the Enter key sends to a terminal.
    window.api.session.write(sessionId, snippet.command.replace(/\r?\n/g, '\r') + '\r')
    setOpen(false)
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button className={styles.btn} onClick={() => setOpen((v) => !v)} title="Run a saved command">
        ⚡ Snippets
      </button>
      {open && (
        <div className={styles.popover}>
          {snippets.length === 0 && <div className={styles.empty}>No snippets yet</div>}
          {snippets.map((s) => (
            <div key={s.id} className={styles.item} onClick={() => run(s)} title={s.command}>
              <span className={styles.itemName}>{s.name}</span>
              <span className={styles.itemCmd}>{s.command.split('\n')[0]}</span>
            </div>
          ))}
          <div
            className={`${styles.item} ${styles.manage}`}
            onClick={() => {
              setOpen(false)
              setEditing(true)
            }}
          >
            Edit snippets…
          </div>
        </div>
      )}
      {editing && (
        <SnippetsEditor
          initial={snippets.length ? snippets : []}
          onClose={() => setEditing(false)}
          onSaved={setSnippets}
        />
      )}
    </div>
  )
}

function SnippetsEditor(props: {
  initial: Snippet[]
  onClose: () => void
  onSaved: (s: Snippet[]) => void
}): JSX.Element {
  const [list, setList] = useState<Snippet[]>(props.initial)

  // The popover may not have been opened since this editor was mounted; make sure we start from
  // what's actually saved.
  useEffect(() => {
    window.api.vault.getSnippets().then(setList)
  }, [])

  function update(id: string, patch: Partial<Snippet>): void {
    setList((l) => l.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  async function save(): Promise<void> {
    const clean = list.filter((s) => s.name.trim() && s.command.trim())
    await window.api.vault.saveSnippets(clean)
    props.onSaved(clean)
    props.onClose()
  }

  return (
    <div className={styles.overlay} onClick={props.onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Snippets</h2>
        <p className={styles.hint}>
          Saved commands, shared by every connection in this vault. Clicking one types it into the terminal and
          presses Enter.
        </p>
        <div className={styles.list}>
          {list.map((s) => (
            <div key={s.id} className={styles.editRow}>
              <input
                className={styles.input}
                placeholder="Name"
                value={s.name}
                onChange={(e) => update(s.id, { name: e.target.value })}
              />
              <textarea
                className={styles.input}
                placeholder="Command"
                rows={2}
                value={s.command}
                onChange={(e) => update(s.id, { command: e.target.value })}
              />
              <button
                className={styles.secondaryBtn}
                title="Remove"
                onClick={() => setList((l) => l.filter((x) => x.id !== s.id))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div>
          <button
            className={styles.secondaryBtn}
            onClick={() => setList((l) => [...l, { id: uuid(), name: '', command: '' }])}
          >
            + Add snippet
          </button>
        </div>
        <div className={styles.actions}>
          <button className={styles.secondaryBtn} onClick={props.onClose}>
            Cancel
          </button>
          <button className={styles.primaryBtn} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
