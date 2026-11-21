import { useEffect, useMemo, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useVaultStore } from '../../state/vaultStore'
import type {
  AuthType,
  ConnectionConfig,
  ConnectionProtocol,
  PortForward,
  TreeNode,
  VaultKey
} from '../../../../shared/types'
import styles from './ConnectionDialog.module.css'

interface Props {
  parentId: string
  existing?: ConnectionConfig
  onClose: () => void
}

type KeyMode = 'saved' | 'import' | 'reference'

interface KeyOption {
  value: string // `lib:<keyId>` for a key already in the vault's library, `inline:<connId>` for one still embedded in another connection
  label: string // shown in the dropdown
  name: string // what gets stored if this key is added to the library
  content: string
}

function collectInlineKeys(node: TreeNode, out: ConnectionConfig[]): void {
  if (node.type === 'folder') node.children.forEach((c) => collectInlineKeys(c, out))
  else if (node.keyContent) out.push(node)
}

const DEFAULT_PORT: Record<ConnectionProtocol, number> = { ssh: 22, rdp: 3389 }

export default function ConnectionDialog({ parentId, existing, onClose }: Props): JSX.Element {
  const upsertConnection = useVaultStore((s) => s.upsertConnection)
  const root = useVaultStore((s) => s.root)
  const [libraryKeys, setLibraryKeys] = useState<VaultKey[]>([])
  const [savedChoice, setSavedChoice] = useState(existing?.keyId ? `lib:${existing.keyId}` : '')

  const [protocol, setProtocol] = useState<ConnectionProtocol>(existing?.protocol ?? 'ssh')
  const [name, setName] = useState(existing?.name ?? '')
  const [host, setHost] = useState(existing?.host ?? '')
  const [port, setPort] = useState(existing?.port ?? 22)
  const [username, setUsername] = useState(existing?.username ?? '')
  const [authType, setAuthType] = useState<AuthType>(existing?.authType ?? 'password')
  const [password, setPassword] = useState(existing?.password ?? '')
  const [keyMode, setKeyMode] = useState<KeyMode>(
    existing?.keyId ? 'saved' : existing?.keyPath && !existing?.keyContent ? 'reference' : 'import'
  )
  const [keyPath, setKeyPath] = useState(existing?.keyPath ?? '')
  const [keyContent, setKeyContent] = useState(existing?.keyContent ?? '')
  const [keyFileName, setKeyFileName] = useState(existing?.keyFileName ?? '')
  const [keyPassphrase, setKeyPassphrase] = useState(existing?.keyPassphrase ?? '')
  const [rdpDomain, setRdpDomain] = useState(existing?.rdpDomain ?? '')
  const [jumpHostId, setJumpHostId] = useState(existing?.jumpHostId ?? '')
  const [tunnels, setTunnels] = useState<PortForward[]>(existing?.tunnels ?? [])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.vault.getKeys().then(setLibraryKeys)
  }, [])

  // Keys the user can reuse: everything in the vault's library, plus keys that older versions
  // embedded directly in other connections (offered too so they can be shared instead of copied
  // again) — de-duplicated by content, library entries winning.
  const keyOptions = useMemo<KeyOption[]>(() => {
    const options: KeyOption[] = libraryKeys.map((k) => ({ value: `lib:${k.id}`, label: k.name, name: k.name, content: k.content }))
    const seen = new Set(libraryKeys.map((k) => k.content.trim()))
    const inline: ConnectionConfig[] = []
    if (root) collectInlineKeys(root, inline)
    for (const conn of inline) {
      const content = conn.keyContent as string
      if (seen.has(content.trim())) continue
      seen.add(content.trim())
      const keyName = conn.keyFileName || 'key'
      options.push({ value: `inline:${conn.id}`, label: `${keyName} (from ${conn.name})`, name: keyName, content })
    }
    return options
  }, [libraryKeys, root])

  // For a brand-new connection, default to reusing a key when there's one to reuse.
  useEffect(() => {
    if (!existing && keyOptions.length > 0 && keyMode === 'import' && !keyContent) {
      setKeyMode('saved')
      setSavedChoice((c) => c || keyOptions[0].value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyOptions.length])

  // SSH connections that can serve as a jump host (not this one).
  const jumpCandidates = useMemo(() => {
    const found: ConnectionConfig[] = []
    const walk = (n: TreeNode): void => {
      if (n.type === 'connection') {
        if (n.protocol !== 'rdp' && n.id !== existing?.id) found.push(n)
      } else n.children.forEach(walk)
    }
    if (root) walk(root)
    return found
  }, [root, existing?.id])

  function updateTunnel(id: string, patch: Partial<PortForward>): void {
    setTunnels((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function switchProtocol(next: ConnectionProtocol): void {
    // Jump the port to the new protocol's default, but only if it's still at the previous
    // protocol's default — leave a custom port the user typed untouched.
    if (port === DEFAULT_PORT[protocol]) setPort(DEFAULT_PORT[next])
    setProtocol(next)
  }

  async function pickKey(): Promise<void> {
    const path = await window.api.dialogs.pickKeyFile()
    if (path) setKeyPath(path)
  }

  async function importKey(): Promise<void> {
    const result = await window.api.dialogs.pickAndImportKeyFile()
    if (result) {
      setKeyContent(result.content)
      setKeyFileName(result.fileName)
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim() || !host.trim() || !username.trim()) {
      setError('Name, host and username are required')
      return
    }
    if (protocol === 'ssh' && authType === 'key' && keyMode === 'reference' && !keyPath) {
      setError('Please select a private key file')
      return
    }
    if (protocol === 'ssh' && authType === 'key' && keyMode === 'import' && !keyContent) {
      setError('Please import a private key file')
      return
    }
    if (protocol === 'ssh' && authType === 'key' && keyMode === 'saved' && !savedChoice) {
      setError('Please choose a saved key')
      return
    }

    // Keys live once in the vault's library and connections point at them, so one key used by
    // many servers isn't copied into every connection (which bloats the vault file).
    let keyId: string | undefined
    if (protocol === 'ssh' && authType === 'key') {
      if (keyMode === 'import') {
        keyId = (await window.api.vault.addKey(keyFileName || 'imported key', keyContent)).id
      } else if (keyMode === 'saved') {
        const option = keyOptions.find((o) => o.value === savedChoice)
        if (!option) {
          setError('That saved key is no longer available')
          return
        }
        keyId = savedChoice.startsWith('lib:')
          ? savedChoice.slice(4)
          : (await window.api.vault.addKey(option.name, option.content)).id
      }
    }

    const cleanTunnels = tunnels.filter((t) => t.bindPort > 0 && t.destPort > 0 && t.destHost.trim())

    const conn: ConnectionConfig =
      protocol === 'rdp'
        ? {
            id: existing?.id ?? uuid(),
            type: 'connection',
            protocol: 'rdp',
            name: name.trim(),
            host: host.trim(),
            port: Number(port) || DEFAULT_PORT.rdp,
            username: username.trim(),
            authType: 'password',
            rdpDomain: rdpDomain.trim() || undefined
          }
        : {
            id: existing?.id ?? uuid(),
            type: 'connection',
            protocol: 'ssh',
            name: name.trim(),
            host: host.trim(),
            port: Number(port) || DEFAULT_PORT.ssh,
            username: username.trim(),
            authType,
            password: authType === 'password' ? password : undefined,
            keyPath: authType === 'key' && keyMode === 'reference' ? keyPath : undefined,
            keyId,
            keyPassphrase: authType === 'key' ? keyPassphrase : undefined,
            jumpHostId: jumpHostId || undefined,
            tunnels: cleanTunnels.length > 0 ? cleanTunnels : undefined
          }

    await upsertConnection(parentId, conn)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form className={styles.card} onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className={styles.title}>{existing ? 'Edit connection' : 'New connection'}</h2>

        <div className={styles.row}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${protocol === 'ssh' ? styles.tabActive : ''}`}
              onClick={() => switchProtocol('ssh')}
            >
              SSH
            </button>
            <button
              type="button"
              className={`${styles.tab} ${protocol === 'rdp' ? styles.tabActive : ''}`}
              onClick={() => switchProtocol('rdp')}
            >
              RDP
            </button>
          </div>
        </div>

        <div className={styles.row}>
          <label className={styles.label}>Name</label>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className={styles.rowSplit}>
          <div className={styles.row} style={{ flex: 3 }}>
            <label className={styles.label}>Host</label>
            <input className={styles.input} value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div className={styles.row} style={{ flex: 1 }}>
            <label className={styles.label}>Port</label>
            <input
              className={styles.input}
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
            />
          </div>
        </div>

        <div className={styles.row}>
          <label className={styles.label}>Username</label>
          <input className={styles.input} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>

        {protocol === 'rdp' && (
          <>
            <div className={styles.row}>
              <label className={styles.label}>Domain (optional)</label>
              <input className={styles.input} value={rdpDomain} onChange={(e) => setRdpDomain(e.target.value)} />
            </div>
            <p className={styles.hint}>
              Opens this connection in your system&apos;s Remote Desktop client, with the host and username
              prefilled. You&apos;ll be prompted for the password there — it isn&apos;t stored for RDP connections.
            </p>
          </>
        )}

        {protocol === 'ssh' && (
          <div className={styles.row}>
            <label className={styles.label}>Authentication</label>
            <div className={styles.tabs}>
              {(['password', 'key', 'agent'] as AuthType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  className={`${styles.tab} ${authType === t ? styles.tabActive : ''}`}
                  onClick={() => setAuthType(t)}
                >
                  {t === 'password' ? 'Password' : t === 'key' ? 'Private key' : 'Agent / Pageant'}
                </button>
              ))}
            </div>
          </div>
        )}

        {protocol === 'ssh' && authType === 'password' && (
          <div className={styles.row}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        {protocol === 'ssh' && authType === 'key' && (
          <>
            <div className={styles.row}>
              <label className={styles.label}>Key storage</label>
              <div className={styles.tabs}>
                <button
                  type="button"
                  className={`${styles.tab} ${keyMode === 'saved' ? styles.tabActive : ''}`}
                  onClick={() => setKeyMode('saved')}
                >
                  Saved key
                </button>
                <button
                  type="button"
                  className={`${styles.tab} ${keyMode === 'import' ? styles.tabActive : ''}`}
                  onClick={() => setKeyMode('import')}
                >
                  Import new key
                </button>
                <button
                  type="button"
                  className={`${styles.tab} ${keyMode === 'reference' ? styles.tabActive : ''}`}
                  onClick={() => setKeyMode('reference')}
                >
                  Reference file path
                </button>
              </div>
            </div>

            {keyMode === 'saved' ? (
              <div className={styles.row}>
                <label className={styles.label}>Key already in this vault</label>
                <select
                  className={styles.input}
                  value={savedChoice}
                  onChange={(e) => setSavedChoice(e.target.value)}
                >
                  <option value="">{keyOptions.length ? 'Choose a key…' : 'No keys saved yet'}</option>
                  {keyOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className={styles.hint}>
                  Reuses a key stored once in the vault, so using one key for several servers doesn&apos;t
                  copy it into every connection. Import a key with “Import new key” to add it here.
                </p>
              </div>
            ) : keyMode === 'import' ? (
              <div className={styles.row}>
                <label className={styles.label}>Private key (OpenSSH or PuTTY .ppk)</label>
                <div className={styles.rowSplit}>
                  <input
                    className={styles.input}
                    value={keyFileName}
                    readOnly
                    placeholder="No key imported"
                  />
                  <button type="button" className={styles.secondaryBtn} onClick={importKey}>
                    Import…
                  </button>
                </div>
                {keyContent && (
                  <p className={styles.hint}>
                    The key is stored once inside the encrypted vault (and can be reused by other connections) —
                    this connection will keep working if the app is moved to another machine.
                  </p>
                )}
              </div>
            ) : (
              <div className={styles.row}>
                <label className={styles.label}>Private key file (OpenSSH or PuTTY .ppk)</label>
                <div className={styles.rowSplit}>
                  <input className={styles.input} value={keyPath} readOnly placeholder="No file selected" />
                  <button type="button" className={styles.secondaryBtn} onClick={pickKey}>
                    Browse…
                  </button>
                </div>
                <p className={styles.hint}>
                  Only the file path is saved — this connection will break if the app is moved to another machine
                  without that same key file at that same path.
                </p>
              </div>
            )}

            <div className={styles.row}>
              <label className={styles.label}>Passphrase (optional)</label>
              <input
                className={styles.input}
                type="password"
                value={keyPassphrase}
                onChange={(e) => setKeyPassphrase(e.target.value)}
              />
            </div>
          </>
        )}

        {protocol === 'ssh' && authType === 'agent' && (
          <p className={styles.hint}>
            Uses keys already loaded in Pageant (Windows) or ssh-agent (Linux/macOS). No password or key file needed
            here.
          </p>
        )}

        {protocol === 'ssh' && (
          <>
            <div className={styles.row}>
              <label className={styles.label}>Jump host (optional)</label>
              <select className={styles.input} value={jumpHostId} onChange={(e) => setJumpHostId(e.target.value)}>
                <option value="">None — connect directly</option>
                {jumpCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.username}@{c.host})
                  </option>
                ))}
              </select>
              <p className={styles.hint}>Connects through another saved connection first (like ssh -J).</p>
            </div>

            <div className={styles.row}>
              <label className={styles.label}>Port forwarding (optional)</label>
              {tunnels.map((t) => (
                <div className={styles.rowSplit} key={t.id} style={{ marginBottom: 6 }}>
                  <select
                    className={styles.input}
                    style={{ flex: 2 }}
                    value={t.type}
                    onChange={(e) => updateTunnel(t.id, { type: e.target.value as PortForward['type'] })}
                  >
                    <option value="local">Local</option>
                    <option value="remote">Remote</option>
                  </select>
                  <input
                    className={styles.input}
                    style={{ flex: 2 }}
                    type="number"
                    placeholder="Port"
                    value={t.bindPort || ''}
                    onChange={(e) => updateTunnel(t.id, { bindPort: Number(e.target.value) })}
                  />
                  <input
                    className={styles.input}
                    style={{ flex: 4 }}
                    placeholder="Dest. host"
                    value={t.destHost}
                    onChange={(e) => updateTunnel(t.id, { destHost: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    style={{ flex: 2 }}
                    type="number"
                    placeholder="Port"
                    value={t.destPort || ''}
                    onChange={(e) => updateTunnel(t.id, { destPort: Number(e.target.value) })}
                  />
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    title="Remove"
                    onClick={() => setTunnels((list) => list.filter((x) => x.id !== t.id))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() =>
                    setTunnels((list) => [
                      ...list,
                      { id: uuid(), type: 'local', bindPort: 0, destHost: 'localhost', destPort: 0 }
                    ])
                  }
                >
                  + Add tunnel
                </button>
              </div>
              <p className={styles.hint}>
                Local: this PC&apos;s port → destination, as seen from the server. Remote: the server&apos;s port →
                destination, as seen from this PC. Active while the session is open.
              </p>
            </div>
          </>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryBtn}>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
