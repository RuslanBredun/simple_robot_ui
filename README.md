# Simple Robot UI

Local offline maintenance interface for an Ubuntu/ROS 2 robot. Current MVP (v0.2) is a **four-page React UI** with a Python standard-library backend.

## Scope
- **Info** — introductory product information (placeholder; no real firmware inventory yet).
- **Diagnostics** — live `turret.service` status, Stop/Restart and journal logs refreshed every 2.5 seconds.
- **Settings** and **Control** — clearly marked placeholders for Extended edition.

The server listens on **127.0.0.1:8080 only**. No Wi-Fi access point, network-facing control, or authentication yet. Do not expose this MVP directly to untrusted networks.

## Installation (offline on Raspberry Pi / Ubuntu)

1. Download `turret-web_0.2.0_all.deb` from the GitHub Actions **Build DEB** run artifacts.
2. Verify target already has `python3`, `systemd`, and `sudo` (the DEB declares but does not vendor these Ubuntu OS dependencies).
3. Install:
```bash
sudo apt install ./turret-web_0.2.0_all.deb
sudo systemctl status turret-web.service
```
4. On the Pi visit `http://127.0.0.1:8080`; from a workstation, temporarily tunnel with `ssh -L 8080:127.0.0.1:8080 ubuntu@PI_IP`.

The separate `turret-web.service` runs regardless of whether `turret.service` is running. The latter must exist for buttons and logs to work.

## Development
```bash
python3 -m unittest discover -s tests -v
cd frontend
npm install
npm run build
cd ..
python3 backend/server.py
```
Build dependencies (Node, npm, React, Vite) are **CI/development-only**, not target-side dependencies.

## CI
`.github/workflows/build-deb.yml` tests backend, runs `npm install && npm run build`, packages static files + backend + systemd into an `Architecture: all` DEB and uploads it as a workflow artifact. Pin dependencies using a committed `package-lock.json` and change to `npm ci` once lockfile is generated in an online environment.

## Future
QA CLI adapters (`turret-info`, `turret-diag`, etc), actual device/firmware inventory, graphs, Basic/Extended capability gates, safe authenticated control, Factory AP / Field Ethernet policy.

See [architecture](docs/ARCHITECTURE.md) and [installation](docs/INSTALL.md).
