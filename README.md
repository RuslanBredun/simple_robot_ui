# Simple Robot UI

Local offline maintenance interface for an Ubuntu/ROS 2 robot. v0.4 Basic is a
read-only four-page React UI with a Python standard-library backend.

## Scope

- **Info** — System shows product/model identifiers and software versions
  reported by `turret-info`, plus the Web UI version and package build date.
  Missing STM and camera-module software/board versions are explicitly marked
  unavailable.
  The Guide is organized into product overview, Antibag, first startup,
  package contents, Web UI, and additional modules/integrations.
- **Diagnostics** — Overview, Charts, and Logs tabs show service state and logs
  from `turret-status` and `turret-logs`, ROS 2 motor/joint/orchestrator
  telemetry, sensor health, and Linux CPU/RAM/CPU-temperature/disk/uptime
  metrics. Overview shows application activity, operator connection, turret
  and weapon state, axes/drives, and sensors; computer and battery metrics are
  kept in Charts. Charts sample at 5 Hz and support a synchronized crosshair, pause,
  and a 30-second to 15-minute time window. Overview information is grouped
  into tower, axis/drive, and sensor cards; charts are divided into subtabs.
  Logs can show entries since the main application started or
  within a range from 15 minutes to 24 hours. Motor current is converted from
  milliamps to amps; motor voltage and temperature are displayed in volts and
  degrees Celsius. Joint velocities are displayed in degrees per second.
  Battery charge is an explicitly labelled runtime estimate derived from
  voltage, not BMS SOC.
  S360 position/velocity charts are hidden until their data source and units
  are confirmed.
  While hovering, the crosshair stays at a fixed relative position as samples
  continue to update; measured values appear beside the nearest points.
  Confirmed Start/Stop/Restart actions are limited to the fixed `turret.service`
  unit; report, copy, and export buttons remain placeholders.
- **Control** — v0.5 layout preview: single camera panel, camera/quality selectors, inactive joystick, local Motion Enable/Slow Mode toggles, disabled Homing, tool IDs 1/2/3/5 and modes 1/2/3. No video or device command integration yet. Tool safety/activation are status-only.
- **Settings** — unavailable.

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
npm test
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
