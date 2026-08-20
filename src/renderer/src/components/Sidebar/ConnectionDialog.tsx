import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useVaultStore } from '../../state/vaultStore'
import type { AuthType, ConnectionConfig, ConnectionProtocol } from '../../../../shared/types'
import styles from './ConnectionDialog.module.css'

interface Props {
  parentId: string
  existing?: ConnectionConfig
  onClose: () => void
}

type KeyMode = 'import' | 'reference'

const DEFAULT_PORT: Record<ConnectionProtocol, number> = { ssh: 22, rdp: 3389 }

export default function ConnectionDialog({ parentId, existing, onClose }: Props): JSX.Element {
  const upsertConnection = useVaultStore((s) => s.upsertConnection)

  const [protocol, setProtocol] = useState<ConnectionProtocol>(existing?.protocol ?? 'ssh')
  const [name, setName] = useState(existing?.name ?? '')
  const [host, setHost] = useState(existing?.host ?? '')
  const [port, setPort] = useState(existing?.port ?? 22)
  const [username, setUsername] = useState(existing?.username ?? '')
  const [authType, setAuthType] = useState<AuthType>(existing?.authType ?? 'password')
  const [password, setPassword] = useState(existing?.password ?? '')
  const [keyMode, setKeyMode] = useState<KeyMode>(existing?.keyPath && !existing?.keyContent ? 'reference' : 'import')
  const [keyPath, setKeyPath] = useState(existing?.keyPath ?? '')
  const [keyContent, setKeyContent] = useState(existing?.keyContent ?? '')
  const [keyFileName, setKeyFileName] = useState(existing?.keyFileName ?? '')
  const [keyPassphrase, setKeyPassphrase] = useState(existing?.keyPassphrase ?? '')
  const [rdpDomain, setRdpDomain] = useState(existing?.rdpDomain ?? '')
  const [error, setError] = useState<string | null>(null)

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
            keyContent: authType === 'key' && keyMode === 'import' ? keyContent : undefined,
            keyFileName: authType === 'key' && keyMode === 'import' ? keyFileName : undefined,
            keyPassphrase: authType === 'key' ? keyPassphrase : undefined
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
                  className={`${styles.tab} ${keyMode === 'import' ? styles.tabActive : ''}`}
                  onClick={() => setKeyMode('import')}
                >
                  Import into vault (portable)
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

            {keyMode === 'import' ? (
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
                    Key content is stored inside the encrypted vault — this connection will keep working if the app
                    is moved to another machine.
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
