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
`/joint_states` supplies joint positions, `/weapon_state` supplies turret
weapon mode and operation, `/connection_status` supplies the aggregate control
connection, and `/gimbal_state` supplies the gimbal orchestrator mode and
homing operation state. `/vehicle_mode` supplies the vehicle mode id. Missing
packages/topics are reported as unavailable or stale; synthetic data is only
used when `TURRET_WEB_MODE=mock` is explicitly set for development.

The systemd launcher sources `/opt/ros/${ROS_DISTRO}` and
`/opt/robot/ros` when present. The web service remains available if ROS 2 is
not; only live ROS diagnostics are unavailable. The browser samples cached
ROS state at 5 Hz and retains 60 seconds for charts. Service status and latest
100 log lines refresh every 5 seconds. The downloadable JSON report includes
product identifiers and recent logs, but no configuration files.

**Important:** authentication is not implemented. The service binds only to
loopback and must not be exposed to the device LAN or factory AP without an
explicit authentication/authorization and CSRF security redesign. SSH tunnel
is temporary.

Future milestones: firmware inventory, richer ROS diagnostics, safe
configuration editing, Extended operator control, and Factory/Field AP access
policy.
