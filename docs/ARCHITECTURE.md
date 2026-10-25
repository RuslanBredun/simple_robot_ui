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

`turret-info` supplies product and software version fields. The Info page
shows only product identifiers and the requested application/firmware versions;
the DEB builder records its Web UI build date in `build-info.json`.

Diagnostics reads service status and recent logs through the QA commands and
subscribes to ROS 2 topics in a
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
the percentage as an estimate, not BMS SOC.

CPU usage and memory usage are read from `/proc`; uptime is read from
`/proc/uptime`, CPU temperature from a labelled CPU/SoC thermal sensor in
`/sys`, and disk capacity from filesystem statistics. These values are
available to the Charts view, while the Info page omits host and network
details. The Web UI version comes from frontend package metadata and its DEB
build date is stored in packaged `build-info.json`.

The systemd launcher sources `/opt/ros/${ROS_DISTRO}` and
`/opt/robot/ros` when present. The web service remains available if ROS 2 is
not; only live ROS diagnostics are unavailable. The browser samples cached
ROS state and system health at 5 Hz and retains up to 15 minutes for charts.
Charts provide a synchronized crosshair, pause, and time-window selection.
Hovering keeps the crosshair at the same relative chart position while the
live time window and samples continue to advance. Each series' nearest sample
value is displayed next to its point. The Overview shows main application
activity and operator connection separately, followed by four turret/weapon
mode and operation cards, axes/drives, and sensors. Computer and battery
metrics remain in Charts rather than the Overview. The Info Guide has separate
sections for product overview, Antibag, first startup, package contents, Web UI,
and additional integrations; operational procedures are deferred to approved
product documentation.
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

## v0.5 Control mock preview and integration boundary

`frontend/src/pages/ControlPage.jsx` composes separate camera, joystick, motion,
tool, and status components. The layout places full-width status cards
above the central video placeholder. Below the video, the joystick occupies
one column; the other column stacks Motion buttons above Tool selectors and
actions. Enable and Slow are local toggles in the separate Motion panel. Run
Homing, fuse, and activation buttons are disabled. Camera/profile and
tool/mode selections, joystick axes in `[-1, 1]`, and toggles are local UI
state only. Slow Mode does not scale joystick values. The status cards poll
`/api/diagnostics` and show fresh `/connection_status`, `/gimbal_state`, and
`/weapon_state` values; samples older than the existing two-second freshness
threshold are shown as unavailable. The aggregated connection topic does not
identify its source, so the UI explicitly reports source ownership as unknown.
The page has no ROS command publisher, control API, RTSP playback, or tool
activation path.

Source inspection in `/home/ubuntu/ros2_ws` confirmed ROS command and telemetry
contracts exist, but this web package does not integrate with them. The
existing `/connection_status` is an aggregated `std_msgs/Bool` from the
AntiBug and Hmarka connection paths; `/antibug/control_active` is a separate
AntiBug control-activity signal. The ROS workspace does not expose a
`WEB_UI` connection registration, heartbeat, or explicit shared control-owner
lease that this web service can safely use. The existing priority manager's
UDP source tracking is not a web-facing ownership API. The UI therefore does
not register or claim WEB_UI ownership. Do not treat browser activity,
backend-to-ROS availability, source connection, and control ownership as
equivalent states.

The workspace contains RTSP camera URLs for a particular Hmarka K2
configuration, but no browser-compatible video gateway. The configuration
does not define the requested High/Medium/Low labels. Therefore camera
selection in this preview does not select or start a stream. The K2 example
does not provide a per-tool runtime status contract usable by this page.

Future integration must use the planned shared Communication Layer / core
application API to register `WEB_UI` independently, report browser/backend
liveness with timeout, and expose ownership separately from connection.
Control ownership must be explicit and exclusive, must not be acquired on
page load, and must reject requests while another operator owns control. Do
not add direct web-service publishers to shared actuation topics or add a
parallel connection manager. Any future video work requires a browser gateway
and a verified model-specific stream/profile map. Fire/safety activation stays
outside this service UI.
