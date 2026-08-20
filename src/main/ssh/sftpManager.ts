import type { Client, SFTPWrapper } from 'ssh2'
import type { SftpEntry } from '../../shared/types'

export type ProgressCallback = (transferred: number, total: number) => void

function permsToString(mode: number, isDir: boolean): string {
  const perms = [
    mode & 0o400 ? 'r' : '-',
    mode & 0o200 ? 'w' : '-',
    mode & 0o100 ? 'x' : '-',
    mode & 0o040 ? 'r' : '-',
    mode & 0o020 ? 'w' : '-',
    mode & 0o010 ? 'x' : '-',
    mode & 0o004 ? 'r' : '-',
    mode & 0o002 ? 'w' : '-',
    mode & 0o001 ? 'x' : '-'
  ].join('')
  return (isDir ? 'd' : '-') + perms
}

export class SftpManager {
  private sftp: SFTPWrapper | null = null

  constructor(private client: Client) {}

  private open(): Promise<SFTPWrapper> {
    if (this.sftp) return Promise.resolve(this.sftp)
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err)
          return
        }
        this.sftp = sftp
        resolve(sftp)
      })
    })
  }

  async list(remotePath: string): Promise<SftpEntry[]> {
    const sftp = await this.open()
    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          reject(err)
          return
        }
        const entries: SftpEntry[] = list.map((item) => {
          const isDir = item.attrs.isDirectory()
          const isSymlink = item.attrs.isSymbolicLink()
          return {
            name: item.filename,
            path: joinRemote(remotePath, item.filename),
            isDirectory: isDir,
            isSymlink,
            size: item.attrs.size,
            modifyTime: item.attrs.mtime * 1000,
            permissions: permsToString(item.attrs.mode & 0o777, isDir)
          }
        })
        entries.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        resolve(entries)
      })
    })
  }

  async mkdir(remotePath: string): Promise<void> {
    const sftp = await this.open()
    return new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err) => (err ? reject(err) : resolve()))
    })
  }

  async rmdir(remotePath: string): Promise<void> {
    const sftp = await this.open()
    return new Promise((resolve, reject) => {
      sftp.rmdir(remotePath, (err) => (err ? reject(err) : resolve()))
    })
  }

  async unlink(remotePath: string): Promise<void> {
    const sftp = await this.open()
    return new Promise((resolve, reject) => {
      sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve()))
    })
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const sftp = await this.open()
    return new Promise((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err) => (err ? reject(err) : resolve()))
    })
  }

  async download(remotePath: string, localPath: string, onProgress?: ProgressCallback): Promise<void> {
    const sftp = await this.open()
    return new Promise((resolve, reject) => {
      sftp.fastGet(remotePath, localPath, {
        step: (transferred, _chunk, total) => onProgress?.(transferred, total)
      }, (err) => (err ? reject(err) : resolve()))
    })
  }

  async upload(localPath: string, remotePath: string, onProgress?: ProgressCallback): Promise<void> {
    const sftp = await this.open()
    return new Promise((resolve, reject) => {
      sftp.fastPut(localPath, remotePath, {
        step: (transferred, _chunk, total) => onProgress?.(transferred, total)
      }, (err) => (err ? reject(err) : resolve()))
    })
  }

  async stat(remotePath: string): Promise<{ isDirectory: boolean }> {
    const sftp = await this.open()
    return new Promise((resolve, reject) => {
      sftp.stat(remotePath, (err, stats) => {
        if (err) {
          reject(err)
          return
        }
        resolve({ isDirectory: stats.isDirectory() })
      })
    })
  }

  async realpath(remotePath: string): Promise<string> {
    const sftp = await this.open()
    return new Promise((resolve, reject) => {
      sftp.realpath(remotePath, (err, absPath) => (err ? reject(err) : resolve(absPath)))
    })
  }

  /** Server-to-server copy via a piped read/write stream (SFTP has no native copy command). */
  async copy(srcPath: string, destPath: string): Promise<void> {
    const sftp = await this.open()
    return new Promise((resolve, reject) => {
      const readStream = sftp.createReadStream(srcPath)
      const writeStream = sftp.createWriteStream(destPath)
      let settled = false
      const fail = (err: Error): void => {
        if (settled) return
        settled = true
        readStream.destroy()
        writeStream.destroy()
        reject(err)
      }
      readStream.on('error', fail)
      writeStream.on('error', fail)
      writeStream.on('close', () => {
        if (settled) return
        settled = true
        resolve()
      })
      readStream.pipe(writeStream)
    })
  }
}

function joinRemote(base: string, name: string): string {
  if (base.endsWith('/')) return base + name
  return `${base}/${name}`
}
