export function vaultDisplayName(path: string): string {
  if (!path) return 'Connections'
  const base = path.split(/[\\/]/).pop() ?? path
  const withoutExt = base.replace(/\.vault$/i, '')
  return withoutExt
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Connections'
}
