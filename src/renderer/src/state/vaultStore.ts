import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { ChangePasswordResult, ConnectionConfig, FolderConfig, TreeNode } from '../../../shared/types'

interface VaultState {
  unlocked: boolean
  vaultExists: boolean
  path: string
  vaultName?: string
  root: FolderConfig | null
  error: string | null
  // Set by the "Create a new vault" action in the header menu (while a vault is already open)
  // so VaultUnlock knows to jump straight into the create form once it remounts, instead of
  // defaulting to the unlock screen for the vault that was just locked.
  intentCreateNew: boolean

  refreshStatus: () => Promise<void>
  createVaultWithDialog: (name: string, description: string, password: string) => Promise<boolean>
  unlockVault: (password: string) => Promise<boolean>
  lockVault: () => Promise<void>
  pickExistingVault: () => Promise<void>
  saveVaultAs: () => Promise<void>
  changeVaultPassword: (currentPassword: string, newPassword: string) => Promise<ChangePasswordResult>
  requestCreateNew: () => Promise<void>
  clearIntentCreateNew: () => void

  addFolder: (parentId: string, name: string) => Promise<void>
  renameNode: (id: string, name: string) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  upsertConnection: (parentId: string, conn: ConnectionConfig) => Promise<void>
  moveNode: (nodeId: string, newParentId: string) => Promise<void>
  duplicateConnection: (id: string) => Promise<void>
}

function findFolder(node: TreeNode, id: string): FolderConfig | null {
  if (node.type !== 'folder') return null
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findFolder(child, id)
    if (found) return found
  }
  return null
}

function removeNode(node: FolderConfig, id: string): TreeNode | null {
  const idx = node.children.findIndex((c) => c.id === id)
  if (idx >= 0) return node.children.splice(idx, 1)[0]
  for (const child of node.children) {
    if (child.type === 'folder') {
      const found = removeNode(child, id)
      if (found) return found
    }
  }
  return null
}

/** Replaces the node with this id where it already is (same folder, same position). */
function replaceNodeInPlace(node: FolderConfig, replacement: TreeNode): boolean {
  const idx = node.children.findIndex((c) => c.id === replacement.id)
  if (idx >= 0) {
    node.children[idx] = replacement
    return true
  }
  return node.children.some((c) => c.type === 'folder' && replaceNodeInPlace(c, replacement))
}

export const useVaultStore = create<VaultState>((set, get) => ({
  unlocked: false,
  vaultExists: false,
  path: '',
  vaultName: undefined,
  root: null,
  error: null,
  intentCreateNew: false,

  refreshStatus: async () => {
    const status = await window.api.vault.status()
    set({ unlocked: status.ok, vaultExists: status.vaultExists, path: status.path, vaultName: status.vaultName })
    if (status.ok) {
      const root = await window.api.vault.getTree()
      set({ root })
    }
  },

  createVaultWithDialog: async (name, description, password) => {
    const location = await window.api.vault.pickNewLocation(name)
    if (!location) return false
    const result = await window.api.vault.create(password, name, description)
    if (result.ok) {
      const root = await window.api.vault.getTree()
      set({
        unlocked: true,
        vaultExists: true,
        path: result.path,
        vaultName: result.vaultName,
        root,
        error: null
      })
    }
    return result.ok
  },

  unlockVault: async (password) => {
    const result = await window.api.vault.unlock(password)
    if (result.ok) {
      const root = await window.api.vault.getTree()
      set({ unlocked: true, path: result.path, vaultName: result.vaultName, root, error: null })
    } else {
      set({ error: result.error ?? 'Failed to unlock' })
    }
    return result.ok
  },

  lockVault: async () => {
    await window.api.vault.lock()
    set({ unlocked: false, root: null, vaultName: undefined })
  },

  pickExistingVault: async () => {
    const result = await window.api.vault.pickExisting()
    if (!result) return
    set({
      unlocked: false,
      root: null,
      vaultExists: result.vaultExists,
      path: result.path,
      vaultName: undefined,
      error: null
    })
  },

  saveVaultAs: async () => {
    const result = await window.api.vault.saveAs()
    if (!result) return
    set({ path: result.path, vaultName: result.vaultName })
  },

  changeVaultPassword: async (currentPassword, newPassword) => {
    return window.api.vault.changePassword(currentPassword, newPassword)
  },

  requestCreateNew: async () => {
    set({ intentCreateNew: true })
    await get().lockVault()
  },

  clearIntentCreateNew: () => set({ intentCreateNew: false }),

  addFolder: async (parentId, name) => {
    const root = get().root
    if (!root) return
    const parent = findFolder(root, parentId)
    if (!parent) return
    const folder: FolderConfig = { id: uuid(), type: 'folder', name, children: [] }
    parent.children.push(folder)
    set({ root: { ...root } })
    await window.api.vault.saveTree(root)
  },

  renameNode: async (id, name) => {
    const root = get().root
    if (!root) return
    function rename(node: TreeNode): void {
      if (node.id === id) node.name = name
      else if (node.type === 'folder') node.children.forEach(rename)
    }
    rename(root)
    set({ root: { ...root } })
    await window.api.vault.saveTree(root)
  },

  deleteNode: async (id) => {
    const root = get().root
    if (!root) return
    removeNode(root, id)
    set({ root: { ...root } })
    await window.api.vault.saveTree(root)
  },

  upsertConnection: async (parentId, conn) => {
    const root = get().root
    if (!root) return
    // Editing an existing connection must leave it where it is (inside whichever folder it's in,
    // at the same position). Only a connection that doesn't exist yet is added to `parentId`.
    if (!replaceNodeInPlace(root, conn)) {
      const parent = findFolder(root, parentId) ?? root
      parent.children.push(conn)
    }
    set({ root: { ...root } })
    await window.api.vault.saveTree(root)
  },

  duplicateConnection: async (id) => {
    const root = get().root
    if (!root) return
    // Insert the copy right after the original, in the same folder.
    const insertCopy = (folder: FolderConfig): boolean => {
      const idx = folder.children.findIndex((c) => c.id === id)
      if (idx >= 0) {
        const original = folder.children[idx] as ConnectionConfig
        folder.children.splice(idx + 1, 0, { ...original, id: uuid(), name: `${original.name} (copy)` })
        return true
      }
      return folder.children.some((c) => c.type === 'folder' && insertCopy(c))
    }
    if (!insertCopy(root)) return
    set({ root: { ...root } })
    await window.api.vault.saveTree(root)
  },

  moveNode: async (nodeId, newParentId) => {
    const root = get().root
    if (!root) return
    if (nodeId === newParentId) return
    const node = removeNode(root, nodeId)
    if (!node) return
    const parent = findFolder(root, newParentId) ?? root
    parent.children.push(node)
    set({ root: { ...root } })
    await window.api.vault.saveTree(root)
  }
}))
