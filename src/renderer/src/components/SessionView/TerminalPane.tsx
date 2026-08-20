import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TabState } from '../../state/sessionStore'
import styles from './TerminalPane.module.css'

export default function TerminalPane({ tab, active }: { tab: TabState; active: boolean }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

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
    // OS context menu (matches MobaXterm/PuTTY convention).
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

    const unsubscribeData = window.api.session.onData((sessionId, data) => {
      if (sessionId === tab.id) term.write(data)
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
