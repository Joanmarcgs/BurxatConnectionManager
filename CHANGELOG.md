# Changelog

All notable changes to this project are documented here.

## [0.2.0] - 2026-08-27

### Added

- **RDP connections.** A new tab in the connection dialog alongside SSH — opens through your
  OS's native Remote Desktop client (`mstsc` on Windows, `xfreerdp` on Linux) with host/username
  prefilled. The password is never stored or written to disk; the native client prompts for it.
- **Terminal output colorization.** Highlights IPs (v4/v6), MAC addresses, URLs, UUIDs, and a
  few status words (error/warning/success) in plain SSH output. Lines that already contain their
  own ANSI codes (colored `ls`, prompts, vim, htop, etc.) are always left untouched. Toggle via
  Settings → **Terminal style**: *Default (colored)* or *Raw*.
- **Redesigned vault creation.** "Create a new vault" now goes straight to a form (Name
  required, Description optional, master password optional) instead of showing a fixed file path
  before you'd named anything — the save dialog only appears once you confirm, pre-filled with
  your name as the suggested filename. Vaults now carry their name/description inside the
  encrypted data itself, so the sidebar shows what you actually called it.
- **Vault menu.** The three icon buttons next to the vault name are now a single hamburger menu
  with text labels: *Open a different vault*, *Create a new vault*, *Lock vault*, *Save current
  vault as* (new — writes the vault to a new file under the same password and switches to it),
  and *Change master password* (new — requires the current password, new password is optional
  same as at creation).

### Fixed

- **Battery drain from idle SSH sessions.** The CPU/RAM stats poller ran every 3 seconds for
  every connected session indefinitely, regardless of whether its tab was visible or the window
  had focus — periodic network/CPU wakeups that prevent a laptop from reaching deeper
  power-saving states. Polling now pauses for any session that isn't both the active tab and in
  a focused window, and resumes immediately (not on the next tick) when it becomes one again.
- **Terminal output corruption on Windows targets.** `ssh2`'s `shell()` defaulted to an 80x24
  pty while this app's terminal is usually much wider; column-aligned output (`ipconfig /all`,
  `ls -l`, etc.) rendered against that stale narrow width until the follow-up resize landed,
  corrupting anything already in flight. Fixed by requesting a generously oversized initial pty.
  Found and fixed together with a related bug where flushing a buffered partial line ending in a
  bare `\r` (its `\n` not yet arrived) moved the cursor back to column 0, letting later output
  silently overwrite it.

### Changed

- Removed all "MobaXterm" references from the app and its documentation (not affiliated; no
  need to reference it).

## [0.1.0] - 2026-08-20

First public release.

### Added

- SSH terminal ([xterm.js](https://xtermjs.org/)) + SFTP file browser side by side, per
  connection tab.
- SSH authentication: password, private key (OpenSSH or PuTTY `.ppk`, optional passphrase), or
  agent (Pageant on Windows, `ssh-agent` on Linux/macOS).
- Private keys can be imported directly into the vault for full portability, or referenced by
  file path.
- SFTP operations: browse, upload, download, rename, delete, create folders, server-side copy,
  copy-to-another-folder, resizable/reorderable columns.
- Edit remote files in your own editor, with automatic re-upload on save.
- Live CPU/RAM stats in the status bar while an SSH session is connected.
- Terminal right-click-to-paste and select-to-copy.
- Multiple vaults, each with its own (optional) master password.
- Fully portable: no installer, vault lives next to the executable.
- Windows portable zip (custom launcher, no NSIS self-extraction delay) and Linux AppImage
  build targets.

[0.2.0]: https://github.com/Joanmarcgs/BurxatConnectionManager/releases/tag/v0.2.0
[0.1.0]: https://github.com/Joanmarcgs/BurxatConnectionManager/releases/tag/v0.1.0
