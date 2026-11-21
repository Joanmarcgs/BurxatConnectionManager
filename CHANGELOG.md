# Changelog

All notable changes to this project are documented here.

## [Unreleased]

## [0.3.0] - 2026-11-21

### Added

- **Live search bar** in the sidebar header (magnifier on the right, ☰ menu on the left). The
  tree filters as you type, by name or host, keeping the folders that lead to matches.
- **Duplicate** connection (right-click menu).
- **Import** connections from an OpenSSH config file or from PuTTY's saved sessions (☰ menu).
  ProxyJump entries between imported hosts are preserved.
- **Jump host (ProxyJump)**: a connection can go through another saved connection first, chained.
- **Port forwarding**: local and remote tunnels per connection, active while the session is open.
- **Snippets**: saved commands (stored in the vault) run from the ⚡ Snippets button in the status
  bar, with an editor.
- **Reconnect** button on the failed-connection screen and when a session is closed.

### Fixed

- A failed connection's error message now stays on screen instead of flashing and leaving a blank
  terminal; the technical "Error invoking remote method" prefix is removed.
- The connection dialog fits small windows (scrolls) and is a little wider.

### Changed

- The vault name is no longer repeated in the sidebar header (it's in the tab above and in the ☰
  button's tooltip).

## [0.2.2] - 2026-11-21

### Added

- **Release workflow on GitHub Actions** (`.github/workflows/release.yml`): builds the Windows
  zip and Linux tarball on GitHub-hosted runners when a `v*` tag is pushed, and publishes the
  release using that version's CHANGELOG section as the notes. Prepared for Windows code signing
  through SignPath Foundation (see `docs/code-signing.md`); without the SignPath secret it
  publishes an unsigned zip as before.
- README **Code signing policy** section.

### Changed

- New Settings button **Set as default app for .vault files**: registers the `.vault` file type
  for the current location of the app (current Windows user only, no admin), so double-click keeps
  working after moving or updating the folder.
- The Settings window now scrolls when the app window is too small to show it all.
- Editing a connection that lives inside a folder now keeps it in that folder (and position)
  instead of moving it to the root.
- `scripts/build-portable-win.ps1` gained `-StageOnly` and `-ZipStage <folder>` so the
  executables can be signed between building and zipping; with no arguments it behaves as before.
  The launcher now carries product name/version metadata matching the main executable.

## [0.2.1] - 2026-11-20

### Added

- **Reusable keys.** Private keys are now stored once in the vault's key library and connections
  point at them, instead of every connection embedding its own copy (which made the vault file
  grow by one key per server). The connection dialog has a new **Saved key** option listing the
  vault's keys — including keys that older vaults embedded directly in other connections, which
  are moved into the library the first time you pick one. **Import new key** adds to the library
  too. Existing connections keep working unchanged until you edit them. The library is not
  readable by older versions: a connection that references a library key won't connect in 0.2.0
  or earlier.
- **Open a vault by double-clicking it.** A `.vault` path passed on the command line (Explorer
  double-click or "Open with" → the launcher exe) now opens the unlock screen for *that* file
  instead of the last-used vault.

### Fixed

- **Garbled terminal / stray new lines after switching tabs.** A hidden tab's terminal was being
  fitted to a bogus ~12x6 size and that size was sent to the remote shell, which redrew itself
  for 12 columns. Only visible terminals are fitted now. Related: the terminal's real size was
  never sent to the server after connecting (only on later resizes); it is now sent once the
  session connects.

### Changed

- "Open a different vault" / "Create a new vault" on the unlock screen are now proper buttons
  instead of small underlined links.

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

[0.2.1]: https://github.com/Joanmarcgs/BurxatConnectionManager/releases/tag/v0.2.1
[0.2.0]: https://github.com/Joanmarcgs/BurxatConnectionManager/releases/tag/v0.2.0
[0.1.0]: https://github.com/Joanmarcgs/BurxatConnectionManager/releases/tag/v0.1.0
