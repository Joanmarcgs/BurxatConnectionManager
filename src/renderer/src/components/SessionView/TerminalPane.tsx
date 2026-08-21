import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TabState } from '../../state/sessionStore'
import { useSettingsStore } from '../../state/settingsStore'
import { colorizeLine, containsEscapeCode } from '../../utils/terminalColorize'
import styles from './TerminalPane.module.css'

export default function TerminalPane({ tab, active }: { tab: TabState; active: boolean }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const colorizeRef = useRef(true)
  const colorizeOutput = useSettingsStore((s) => s.settings.colorizeOutput)

  useEffect(() => {
    colorizeRef.current = colorizeOutput
  }, [colorizeOutput])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily: "Consolas, 'Cascadia Mono', monospace",
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#1e1f22',
        foreground: '#d7dae0'
      }
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current = term
    fitAddonRef.current = fitAddon

    const dataDisposable = term.onData((data) => {
      window.api.session.write(tab.id, data)
    })
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.api.session.resize(tab.id, cols, rows)
    })

    // Right-click anywhere in the terminal pastes clipboard contents instead of showing the
    // OS context menu (a common terminal-emulator convention).
    function handleContextMenu(e: MouseEvent): void {
      e.preventDefault()
      window.api.clipboard.readText().then((text) => {
        if (text) term.paste(text)
      })
    }
    containerRef.current.addEventListener('contextmenu', handleContextMenu)

    // Selecting text copies it to the clipboard automatically.
    const selectionDisposable = term.onSelectionChange(() => {
      const selection = term.getSelection()
      if (selection) window.api.clipboard.writeText(selection)
    })

    // Colorizes complete lines (IPs, MACs, URLs, UUIDs, a few status words) as they stream in.
    // SSH/pty data arrives in whatever chunking the transport happens to produce — over a real
    // connection (and especially through Windows' ConPTY) that's often far smaller than one
    // line at a time, sometimes just a few bytes. Writing each chunk through immediately as it
    // arrived (as a first version of this did) meant a "line" was almost never actually
    // complete-in-one-chunk in practice, so it barely ever got colorized. Instead, buffer until
    // a newline shows up, bounded by a short max wait per partial segment so a prompt with no
    // trailing newline (e.g. "Password:") still appears promptly rather than hanging — a ~30ms
    // wait is well under normal perception for "instant".
    //
    // One sharp edge: if the buffered partial ends in a bare "\r" (its paired "\n" just hasn't
    // arrived yet — extremely common, since "\r\n" line endings routinely get split across two
    // separate reads), flushing it moves the cursor back to column 0 of that same row. Whatever
    // text shows up next then overwrites what we just wrote instead of appending after it —
    // silent on-screen corruption. So a trailing "\r" always waits for its "\n", up to a longer
    // absolute cap, rather than flushing on the normal short timer.
    const MAX_PARTIAL_WAIT_MS = 30
    const ABSOLUTE_MAX_WAIT_MS = 300
    let pendingLine = ''
    let pendingSince = 0
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    function writeLine(line: string): void {
      term.write(colorizeRef.current && !containsEscapeCode(line) ? colorizeLine(line) : line)
    }

    function clearFlushTimer(): void {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
    }

    function flushPending(): void {
      clearFlushTimer()
      if (!pendingLine) return
      if (pendingLine.endsWith('\r') && Date.now() - pendingSince < ABSOLUTE_MAX_WAIT_MS) {
        flushTimer = setTimeout(flushPending, MAX_PARTIAL_WAIT_MS)
        return
      }
      term.write(pendingLine)
      pendingLine = ''
    }

    const unsubscribeData = window.api.session.onData((sessionId, data) => {
      if (sessionId !== tab.id) return

      if (!pendingLine) pendingSince = Date.now()
      pendingLine += data
      const segments = pendingLine.split('\n')
      pendingLine = segments.pop() ?? ''

      for (const line of segments) {
        writeLine(line)
        term.write('\n')
      }

      if (segments.length > 0) {
        clearFlushTimer() // a line just completed; the timer was for that stale content
        if (pendingLine) pendingSince = Date.now()
      }

      if (pendingLine) {
        // Don't reset an already-running timer — a continuous trickle of small chunks (e.g. a
        // long line arriving byte-by-byte) must still flush within the bound, not stall forever.
        if (!flushTimer) flushTimer = setTimeout(flushPending, MAX_PARTIAL_WAIT_MS)
      } else {
        clearFlushTimer()
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        // container may be hidden (inactive tab); ignore
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      dataDisposable.dispose()
      resizeDisposable.dispose()
      selectionDisposable.dispose()
      containerRef.current?.removeEventListener('contextmenu', handleContextMenu)
      unsubscribeData()
      clearFlushTimer()
      resizeObserver.disconnect()
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  // Switching back to this tab: the container goes from display:none to visible, but if the
  // pixel size ends up identical to before, FitAddon.fit() no-ops (xterm skips resize() when
  // cols/rows haven't changed) and the canvas can be left showing stale/blank content from
  // while it was hidden — the classic "cursor misplaced, looks like nothing was typed" glitch.
  // Force a full repaint on activation regardless of whether the size actually changed.
  useEffect(() => {
    if (!active) return
    const term = termRef.current
    const fitAddon = fitAddonRef.current
    if (!term || !fitAddon) return
    try {
      fitAddon.fit()
    } catch {
      // ignore
    }
    term.refresh(0, term.rows - 1)
    term.focus()
  }, [active])

  return <div ref={containerRef} className={styles.terminal} />
}
