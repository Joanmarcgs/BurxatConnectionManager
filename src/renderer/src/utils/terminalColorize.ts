// Lightweight, conservative syntax highlighting for plain SSH output — IPs, MAC addresses,
// URLs, UUIDs, and a handful of common status words. This only ever runs on lines that contain
// no ANSI escape codes of their own (see `containsEscape` at the call site): colored `ls`
// output, shell prompts, and full-screen TUI apps (vim, htop, less) all rely on precise byte
// sequences, and injecting more codes into those would corrupt them rather than improve them.

const RESET = '\x1b[0m'

const COLOR = {
  ipv4: '\x1b[96m', // bright cyan
  ipv6: '\x1b[36m', // cyan
  mac: '\x1b[94m', // bright blue
  url: '\x1b[4;94m', // underline + bright blue
  uuid: '\x1b[35m', // magenta
  error: '\x1b[1;31m', // bold red
  warn: '\x1b[33m', // yellow
  success: '\x1b[32m' // green
} as const

const IPV4 = String.raw`(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?::\d{1,5})?`
const IPV6 = String.raw`(?:[0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{1,4}|::1|::(?=\s|$)`
const MAC = String.raw`(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}`
const URL = String.raw`https?://[^\s"'<>]+`
const UUID = String.raw`[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}`
const ERROR_WORD = String.raw`error|err|fail(?:ed|ure)?|fatal|exception|denied|refused|cannot|panic`
const WARN_WORD = String.raw`warn(?:ing)?|deprecated|timeout|retry(?:ing)?`
const SUCCESS_WORD = String.raw`success(?:ful|fully)?|succeeded|passed|done|completed|active|running`

const PATTERN = new RegExp(
  [
    `(?<ipv4>\\b${IPV4}\\b)`,
    `(?<mac>\\b${MAC}\\b)`,
    `(?<uuid>\\b${UUID}\\b)`,
    `(?<url>\\b${URL})`,
    `(?<ipv6>\\b(?:${IPV6})\\b)`,
    `(?<error>\\b(?:${ERROR_WORD})\\b)`,
    `(?<warn>\\b(?:${WARN_WORD})\\b)`,
    `(?<success>\\b(?:${SUCCESS_WORD})\\b)`
  ].join('|'),
  'gi'
)

export function containsEscapeCode(text: string): boolean {
  return text.includes('\x1b')
}

export function colorizeLine(line: string): string {
  if (!line) return line
  return line.replace(PATTERN, (match, ...args) => {
    const groups = args[args.length - 1] as Record<string, string | undefined>
    const key = (Object.keys(groups) as (keyof typeof COLOR)[]).find((k) => groups[k] !== undefined)
    if (!key) return match
    return `${COLOR[key]}${match}${RESET}`
  })
}
