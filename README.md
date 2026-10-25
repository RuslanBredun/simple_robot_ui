# Simple Robot UI

Local offline maintenance interface for an Ubuntu/ROS 2 robot. v0.4 Basic is a
read-only four-page React UI with a Python standard-library backend.

## Scope

- **Info** — the System tab combines product fields from `turret-info` with
  Web UI version, hostname, OS, CPU architecture, and local IPv4 addresses by
  network interface; the Guide describes only verified system behavior and
  marks missing product instructions.
- **Diagnostics** — Overview, Charts, and Logs tabs show service state and logs
  from `turret-status` and `turret-logs`, ROS 2 motor/joint/orchestrator
  telemetry, sensor health, and Linux CPU/RAM/CPU-temperature/disk/uptime
  metrics. Charts sample at 5 Hz and support a synchronized crosshair, pause,
  and a 30-second to 15-minute time window. Motor current is converted from
  milliamps to amps; motor voltage and temperature are displayed in volts and
  degrees Celsius. Joint velocities are displayed in degrees per second.
  Battery charge is an explicitly labelled runtime estimate derived from
  voltage, not BMS SOC; a low-charge warning is shown at 20% or below.
  S360 position/velocity charts are hidden until their data source and units
  are confirmed.
  Confirmed Start/Stop/Restart actions are limited to the fixed `turret.service`
  unit; report, copy, and export buttons remain placeholders.
- **Settings** and **Control** — unavailable in Basic.

The server listens on **127.0.0.1:8080 only**. Service actions are available
only in the Overview tab, require confirmation, and are allowlisted to
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

System health metrics are read locally from Linux `/proc`, `/sys`, and
filesystem statistics. CPU temperature is shown only when an explicitly
identified CPU/SoC sensor is available. The confirmed main-battery voltage and
runtime's voltage-derived charge estimate are shown separately from BMS SOC.

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
