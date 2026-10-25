# Simple Robot UI

Local offline maintenance interface for an Ubuntu/ROS 2 robot. v0.4 Basic is a
read-only four-page React UI with a Python standard-library backend.

## Scope

- **Info** — the System tab combines device and software fields from the
  installed `turret-info` utility; the Guide tab explains the Basic workflow.
- **Diagnostics** — Service, Charts, and Logs tabs show service state and logs
  from `turret-status` and `turret-logs`, ROS 2 motor/joint/orchestrator
  telemetry, and 5 Hz charts with numeric value and time axes. The page also
  provides a downloadable JSON report and confirmed Start/Stop/Restart actions
  for the fixed `turret.service` unit.
- **Settings** and **Control** — unavailable in Basic.

The server listens on **127.0.0.1:8080 only**. Service actions are available
only in the Service tab, require confirmation, and are allowlisted to
`turret.service`. They are disabled in Mock Mode. No Wi-Fi access point,
network-facing access, or authentication is included. Do not expose it directly
to untrusted networks.

## Installation (offline on Raspberry Pi / Ubuntu)

1. Download `turret-web_0.4.0_all.deb` from the GitHub Actions **Build DEB**
   run artifacts.
2. Verify that the robot runtime and `python3`, `systemd`, and `adduser` are
   installed.
3. Install:

   ```bash
   sudo apt install ./turret-web_0.4.0_all.deb
   sudo systemctl status turret-web.service
   ```

4. On the Pi visit `http://127.0.0.1:8080`; from a workstation, temporarily
   tunnel with `ssh -L 8080:127.0.0.1:8080 ubuntu@PI_IP`.

The separate `turret-web.service` runs regardless of whether
`turret.service` is running. The robot runtime must install
`turret-info`, `turret-status`, and `turret-logs`. Live ROS telemetry also
requires the ROS 2 environment and robot overlay; without them, the UI reports
ROS telemetry as unavailable while the web service remains available.

The diagnostic report includes product identifiers and recent service logs.
Review it before sharing.

## Development

Run backend tests and frontend build:

```bash
python3 -m unittest discover -s tests -v
cd frontend
npm ci
npm run build
```

For local development, run the backend and Vite in separate terminals.
Mock mode needs neither systemd, robot QA commands, nor ROS 2. It provides
changing synthetic telemetry for UI development:

```bash
TURRET_WEB_MODE=mock python3 backend/server.py
```

```bash
cd frontend
npm ci
npm run dev
```

On Windows PowerShell:

```powershell
$env:TURRET_WEB_MODE = "mock"
python backend/server.py
```

Then run `npm ci` and `npm run dev` in `frontend/`; open the Vite URL shown in
the terminal (normally `http://127.0.0.1:5173`). Mock telemetry is explicitly
marked in the UI and is never used as a fallback in real mode.

Node, npm, React, and Vite are development/CI-only dependencies, not
target-side dependencies.

## CI

`.github/workflows/build-deb.yml` runs backend tests, `npm ci`, the frontend
build, and packages static files, backend, and systemd into an
`Architecture: all` DEB artifact.

## Future

Firmware inventory, richer ROS diagnostics, Extended Settings/Control,
authentication, and Factory AP / Field Ethernet access policy.

See [architecture](docs/ARCHITECTURE.md) and [installation](docs/INSTALL.md).
