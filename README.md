# Burxat's Connection Manager

A portable, MobaXterm-style SSH/RDP/SFTP client. Sidebar tree of folders and connections, SSH with password/key/agent auth (OpenSSH keys, PuTTY `.ppk`, Pageant/ssh-agent) plus RDP via the system's native Remote Desktop client, and a terminal + SFTP file browser side-by-side per SSH session.

## Develop

```bash
npm install
npm run dev
```

First launch asks you to set a master password, which protects a local encrypted vault (`connections.vault`) stored next to the app.

## Build portable binaries

```bash
npm run dist:win     # Windows portable zip: launcher exe + app/ folder (dist/)
npm run dist:linux   # Linux AppImage (dist/)
```

Both artifacts are self-contained: unzip and run the launcher exe (Windows) or copy the file (Linux) anywhere and your `connections.vault` travels with it, written next to the executable at runtime.

## Notes

- Connections support password, private key (OpenSSH or PuTTY `.ppk`, with optional passphrase), or agent auth (Pageant on Windows, `ssh-agent` on Linux/macOS via `SSH_AUTH_SOCK`).
- Right-click the sidebar to add folders/connections; drag items between folders to reorganize.
- Each connection opens in its own tab with a terminal on the left and an SFTP browser on the right (resizable split).
