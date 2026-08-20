import { existsSync, readFileSync, writeFileSync } from 'fs'
import { randomBytes, createCipheriv, createDecipheriv, scryptSync, timingSafeEqual } from 'crypto'
import { vaultFilePath } from './vaultPath'
import type { FolderConfig, VaultData } from '../shared/types'

const SCRYPT_KEYLEN = 32
// N * r * 128 bytes of memory are needed; default maxmem (32MB) only just
// fits N=2**15,r=8, so raise it explicitly to avoid MEMORY_LIMIT_EXCEEDED.
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

interface VaultFileShape {
  salt: string
  iv: string
  authTag: string
  ciphertext: string
}

function emptyVault(): VaultData {
  return { root: { id: 'root', type: 'folder', name: 'Connections', children: [] } as FolderConfig }
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS)
}

export class SecureStore {
  private key: Buffer | null = null
  private data: VaultData | null = null
  private currentPath: string = vaultFilePath()

  getPath(): string {
    return this.currentPath
  }

  /** Switches which vault file subsequent operations target. Locks any currently-open vault first. */
  setPath(path: string): void {
    this.lock()
    this.currentPath = path
  }

  vaultExists(): boolean {
    return existsSync(this.currentPath)
  }

  isUnlocked(): boolean {
    return this.key !== null && this.data !== null
  }

  getData(): VaultData {
    if (!this.data) throw new Error('Vault is locked')
    return this.data
  }

  /** Creates a brand-new vault protected by the given master password. */
  create(masterPassword: string): void {
    const salt = randomBytes(16)
    this.key = deriveKey(masterPassword, salt)
    this.data = emptyVault()
    this.persist(salt)
  }

  /** Attempts to unlock an existing vault; returns false on wrong password. */
  unlock(masterPassword: string): boolean {
    const raw = readFileSync(this.currentPath, 'utf-8')
    const parsed: VaultFileShape = JSON.parse(raw)
    const salt = Buffer.from(parsed.salt, 'base64')
    const iv = Buffer.from(parsed.iv, 'base64')
    const authTag = Buffer.from(parsed.authTag, 'base64')
    const ciphertext = Buffer.from(parsed.ciphertext, 'base64')
    const key = deriveKey(masterPassword, salt)

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(authTag)
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      this.key = key
      this.data = JSON.parse(plaintext.toString('utf-8'))
      return true
    } catch {
      return false
    }
  }

  lock(): void {
    this.key = null
    this.data = null
  }

  save(): void {
    if (!this.key || !this.data) throw new Error('Vault is locked')
    // Reuse the existing salt so the same master password keeps working.
    const raw = readFileSync(this.currentPath, 'utf-8')
    const parsed: VaultFileShape = JSON.parse(raw)
    this.persist(Buffer.from(parsed.salt, 'base64'))
  }

  private persist(salt: Buffer): void {
    if (!this.key || !this.data) throw new Error('Vault is locked')
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const plaintext = Buffer.from(JSON.stringify(this.data), 'utf-8')
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const authTag = cipher.getAuthTag()

    const fileShape: VaultFileShape = {
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64')
    }
    writeFileSync(this.currentPath, JSON.stringify(fileShape), 'utf-8')
  }
}

// Exported for potential future constant-time comparisons (e.g. a "hint" check).
export function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const secureStore = new SecureStore()
