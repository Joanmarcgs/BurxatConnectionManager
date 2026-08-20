import pkg from 'ssh2'
const { PageantAgent } = pkg

/**
 * ssh2 ships a built-in Pageant client (talks to Pageant's IPC directly).
 * Its constructor param is inherited from OpenSSHAgent but unused by Pageant's
 * own getStream() implementation, so the value passed here doesn't matter.
 */
export function getPageantAgent(): InstanceType<typeof PageantAgent> | null {
  if (process.platform !== 'win32') return null
  return new PageantAgent('pageant')
}
