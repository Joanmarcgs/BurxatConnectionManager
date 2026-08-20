import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { ConnectionConfig, FolderConfig, TreeNode } from '../../../shared/types'

interface VaultState {
  unlocked: boolean
  vaultExists: boolean
  path: string
  root: FolderConfig | null
  error: string | null

  refreshStatus: () => Promise<void>
  createVault: (password: string) => Promise<boolean>
  unlockVault: (password: string) => Promise<boolean>
  lockVault: () => Promise<void>
  pickExistingVault: () => Promise<void>
  pickNewVaultLocation: () => Promise<void>

  addFolder: (parentId: string, name: string) => Promise<void>
  renameNode: (id: string, name: string) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  upsertConnection: (parentId: string, conn: ConnectionConfig) => Promise<void>
  moveNode: (nodeId: string, newParentId: string) => Promise<void>
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

export const useVaultStore = create<VaultState>((set, get) => ({
  unlocked: false,
  vaultExists: false,
  path: '',
  root: null,
  error: null,

  refreshStatus: async () => {
    const status = await window.api.vault.status()
    set({ unlocked: status.ok, vaultExists: status.vaultExists, path: status.path })
    if (status.ok) {
      const root = await window.api.vault.getTree()
      set({ root })
    }
  },

  createVault: async (password) => {
    const result = await window.api.vault.create(password)
    if (result.ok) {
      const root = await window.api.vault.getTree()
      set({ unlocked: true, vaultExists: true, path: result.path, root, error: null })
    }
    return result.ok
  },

  unlockVault: async (password) => {
    const result = await window.api.vault.unlock(password)
    if (result.ok) {
      const root = await window.api.vault.getTree()
      set({ unlocked: true, path: result.path, root, error: null })
    } else {
      set({ error: result.error ?? 'Failed to unlock' })
    }
    return result.ok
  },

  lockVault: async () => {
    await window.api.vault.lock()
    set({ unlocked: false, root: null })
  },

  pickExistingVault: async () => {
    const result = await window.api.vault.pickExisting()
    if (!result) return
    set({ unlocked: false, root: null, vaultExists: result.vaultExists, path: result.path, error: null })
  },

  pickNewVaultLocation: async () => {
    const result = await window.api.vault.pickNewLocation()
    if (!result) return
    set({ unlocked: false, root: null, vaultExists: result.vaultExists, path: result.path, error: null })
  },

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
    // Remove any existing node with this id first (covers edits + moves-on-edit).
    removeNode(root, conn.id)
    const parent = findFolder(root, parentId) ?? root
    parent.children.push(conn)
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
