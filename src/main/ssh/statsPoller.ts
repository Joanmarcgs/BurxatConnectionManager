import type { SshSession } from './sshSession'
import type { ServerStats } from '../../shared/types'

const POLL_INTERVAL_MS = 3000

interface CpuSample {
  idle: number
  total: number
}

function parseUnixCpuLine(line: string): CpuSample | null {
  // e.g. "cpu  123 45 678 9012 34 0 12 0 0 0"
  const parts = line.trim().split(/\s+/)
  if (parts[0] !== 'cpu') return null
  const nums = parts.slice(1).map(Number)
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = nums
  const idleAll = idle + iowait
  const total = user + nice + system + idle + iowait + irq + softirq + steal
  return { idle: idleAll, total }
}

async function pollUnix(
  session: SshSession,
  prev: CpuSample | null
): Promise<{ stats: Omit<ServerStats, 'sessionId'>; sample: CpuSample | null }> {
  const { stdout } = await session.exec(
    'cat /proc/stat | head -1; echo "---"; cat /proc/meminfo | grep -E "^(MemTotal|MemAvailable):"'
  )
  const [cpuPart, memPart] = stdout.split('---')
  const sample = parseUnixCpuLine(cpuPart ?? '')

  let cpuPercent: number | null = null
  if (sample && prev) {
    const deltaIdle = sample.idle - prev.idle
    const deltaTotal = sample.total - prev.total
    cpuPercent = deltaTotal > 0 ? Math.max(0, Math.min(100, 100 * (1 - deltaIdle / deltaTotal))) : null
  }

  let memTotalMB = 0
  let memAvailMB = 0
  for (const line of (memPart ?? '').split('\n')) {
    const match = line.match(/^(MemTotal|MemAvailable):\s+(\d+)/)
    if (!match) continue
    const kb = Number(match[2])
    if (match[1] === 'MemTotal') memTotalMB = kb / 1024
    else memAvailMB = kb / 1024
  }

  return {
    stats: {
      platform: 'unix',
      cpuPercent,
      memUsedMB: Math.round(memTotalMB - memAvailMB),
      memTotalMB: Math.round(memTotalMB)
    },
    sample
  }
}

function parseWindowsStatsOutput(stdout: string): Omit<ServerStats, 'sessionId'> | null {
  const loadMatch = stdout.match(/LoadPercentage=(\d+)/)
  const freeMatch = stdout.match(/FreePhysicalMemory=(\d+)/)
  const totalMatch = stdout.match(/TotalVisibleMemorySize=(\d+)/)
  if (!loadMatch && !freeMatch && !totalMatch) return null

  const freeMB = freeMatch ? Number(freeMatch[1]) / 1024 : 0
  const totalMB = totalMatch ? Number(totalMatch[1]) / 1024 : 0
  return {
    platform: 'windows',
    cpuPercent: loadMatch ? Number(loadMatch[1]) : null,
    memUsedMB: Math.round(totalMB - freeMB),
    memTotalMB: Math.round(totalMB)
  }
}

// wmic.exe was removed from Windows Server Core / recent Windows builds; PowerShell's CIM
// cmdlets are the modern replacement and are present wherever PowerShell itself is. The
// script is passed via -EncodedCommand (base64 UTF-16LE) to sidestep cmd.exe/PowerShell
// quoting entirely, since it's invoked through a remote shell we don't control the escaping of.
const POWERSHELL_STATS_SCRIPT = [
  '$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average',
  '$os = Get-CimInstance Win32_OperatingSystem',
  'Write-Output "LoadPercentage=$([int]$cpu)"',
  'Write-Output "FreePhysicalMemory=$($os.FreePhysicalMemory)"',
  'Write-Output "TotalVisibleMemorySize=$($os.TotalVisibleMemorySize)"'
].join('; ')

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

type WindowsStatsMethod = 'wmic' | 'powershell'

async function pollWindows(
  session: SshSession,
  preferredMethod: WindowsStatsMethod | null
): Promise<{ stats: Omit<ServerStats, 'sessionId'>; method: WindowsStatsMethod }> {
  if (preferredMethod !== 'powershell') {
    try {
      const { stdout } = await session.exec(
        'wmic cpu get loadpercentage /value & wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value'
      )
      const stats = parseWindowsStatsOutput(stdout)
      if (stats) return { stats, method: 'wmic' }
    } catch {
      // wmic missing/blocked — fall through to the PowerShell CIM fallback below.
    }
  }

  const encoded = encodePowerShellCommand(POWERSHELL_STATS_SCRIPT)
  const { stdout } = await session.exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`)
  const stats = parseWindowsStatsOutput(stdout) ?? {
    platform: 'windows' as const,
    cpuPercent: null,
    memUsedMB: 0,
    memTotalMB: 0
  }
  return { stats, method: 'powershell' }
}

export interface StatsPollHandle {
  /** Permanently stops polling (session disconnected/closed). */
  stop: () => void
  /**
   * Pauses (false) or resumes (true) the actual remote exec calls without tearing down the
   * poller's detected platform/CPU-sample state. A session sitting in a background tab, or the
   * whole window losing focus, has no reason to keep waking the network/CPU every few seconds —
   * that adds up to real battery drain on a laptop for something the user isn't even looking at.
   */
  setActive: (active: boolean) => void
}

/** Polls basic CPU/RAM stats from the remote host on a separate exec channel. */
export function startStatsPolling(
  session: SshSession,
  sessionId: string,
  onStats: (stats: ServerStats) => void
): StatsPollHandle {
  let platform: 'unix' | 'windows' | null = null
  let prevSample: CpuSample | null = null
  let windowsMethod: WindowsStatsMethod | null = null
  let stopped = false
  let active = true

  async function detectPlatform(): Promise<'unix' | 'windows'> {
    try {
      const { code } = await session.exec('uname -s')
      return code === 0 ? 'unix' : 'windows'
    } catch {
      return 'windows'
    }
  }

  async function tick(): Promise<void> {
    if (stopped || !active) return
    try {
      if (!platform) platform = await detectPlatform()
      if (stopped || !active) return

      if (platform === 'unix') {
        const { stats, sample } = await pollUnix(session, prevSample)
        prevSample = sample
        if (!stopped && active) onStats({ sessionId, ...stats })
      } else {
        const { stats, method } = await pollWindows(session, windowsMethod)
        windowsMethod = method
        if (!stopped && active) onStats({ sessionId, ...stats })
      }
    } catch {
      // Ignore transient polling errors (e.g. session in the middle of closing).
    }
  }

  tick()
  const interval = setInterval(tick, POLL_INTERVAL_MS)

  return {
    stop: () => {
      stopped = true
      clearInterval(interval)
    },
    setActive: (next) => {
      if (next === active) return
      active = next
      // Resuming: get a fresh reading right away instead of waiting up to POLL_INTERVAL_MS.
      if (active) tick()
    }
  }
}
