# Architecture

The application is split into `frontend/` (React + Vite, compiled to static
HTML/JS/CSS), `backend/` (stdlib Python HTTP server and adapters),
`packaging/` (systemd + DEB builder), `tests/`, and `.github/workflows/`.
Target is Ubuntu-based ARM64 Raspberry Pi; Node/npm are not required on the
device.

Basic uses QA commands (`turret-info`, `turret-status`, and `turret-logs`) and
separately confirmed Start/Stop/Restart actions for the fixed `turret.service`
unit. It does not invoke a shell or accept arbitrary command names. Service
action APIs require a loopback Host and an allowlisted same-origin request;
sudoers grants only the three fixed systemctl actions. Mock mode cannot control
the host service. The server listens on `127.0.0.1` only.

`turret-info` supplies the Info fields. Diagnostics reads service status and
recent logs through the QA commands and subscribes to ROS 2 topics in a
background `rclpy` thread when the ROS distribution and robot overlay are
available. Motor state topics include X/Y and optional camera axes.
`/joint_states` supplies joint positions and velocities, `/weapon_state`
supplies weapon mode and operation, `/connection_status` supplies the connection
to the operator application, and `/gimbal_state` supplies the gimbal
orchestrator mode and homing operation state. Vehicle-mode data is not
collected. Missing packages/topics are reported as unavailable or stale;
synthetic data is only used when `TURRET_WEB_MODE=mock` is explicitly set for
development. Motor current arrives in milliamps and is converted to amps;
CANopen motor voltage and temperature are displayed in volts and degrees
Celsius. `/telemetry/sensors_health` supplies configured sensor states.
`/uart_telemetry` supplies main-battery voltage in centivolts and the runtime's
voltage-derived charge estimate; the UI converts voltage to volts and labels
the percentage as an estimate, not BMS SOC. A low-charge warning is shown at
20% or below.

CPU usage and memory usage are read from `/proc`; uptime is read from
`/proc/uptime`, CPU temperature from a labelled CPU/SoC thermal sensor in
`/sys`, and disk capacity from filesystem statistics. Unsupported metrics
remain unavailable with an explanatory error rather than being replaced with
synthetic data in real mode. The Info page gets OS identity from
`/etc/os-release` and Python's platform information; the Web UI version comes
from its frontend package metadata. Local IPv4 addresses are read from the
device's interfaces without making network requests.

The systemd launcher sources `/opt/ros/${ROS_DISTRO}` and
`/opt/robot/ros` when present. The web service remains available if ROS 2 is
not; only live ROS diagnostics are unavailable. The browser samples cached
ROS state and system health at 5 Hz and retains up to 15 minutes for charts.
Charts provide a synchronized crosshair, pause, and time-window selection.
Hovering keeps the crosshair at the same relative chart position while the
live time window and samples continue to advance. Each series' nearest sample
value is displayed next to its point. The Overview groups tower, axis/drive,
sensor, and computer/power status together instead of separate subtabs.
Service status and logs refresh every 5 seconds. Logs support search, level
filters, pause, and auto-scroll; they can show records since the main
`turret.service` activation or use fixed 15-minute, 1-hour, 6-hour, and
24-hour windows. Time-window queries are limited to 100 lines, while the
startup query is bounded to the first 100,000 characters. System and
diagnostic report controls, log download/copy, and CSV export are placeholders;
there is no export endpoint or downloadable report.
User-interface warnings use local thresholds of 80 °C CPU temperature and
less than 10% free space on the root filesystem. These are operational UI
thresholds, not manufacturer-specified limits. Position/velocity charts are
hidden for S360 because the workspace does not confirm an equivalent data
source and units for that model.

**Important:** authentication is not implemented. The service binds only to
loopback and must not be exposed to the device LAN or factory AP without an
explicit authentication/authorization and CSRF security redesign. SSH tunnel
is temporary.

Future milestones: firmware inventory, richer ROS diagnostics, safe
configuration editing, Extended operator control, and Factory/Field AP access
policy.
