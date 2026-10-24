# Architecture

The application is split into `frontend/` (React + Vite, compiled to static HTML/JS/CSS), `backend/` (stdlib Python HTTP server), `packaging/` (systemd + sudoers + DEB builder), `tests/`, and `.github/workflows/`.

Target is an Ubuntu-based ARM64 Raspberry Pi, no Node or npm required on the device. Current `Architecture: all` is valid because backend is interpreted Python and frontend is static.

All three management actions are fixed to `turret.service`: status (unprivileged systemctl), Stop and Restart (allowlisted noninteractive sudo). Logs read with `journalctl` (systemd-journal group). Browser performs a GET for status/logs every 2.5 seconds; mutations require same-loopback Origin and Host.

**Important:** no authentication is implemented. The service binds only to loopback and must never be exposed to the device LAN or factory AP without an explicit authentication/authorization and CSRF security redesign. SSH tunnel is temporary.

Future milestones: QA CLI wrapper, ROS2 diagnostics/charts, Info firmware manifest, settings configuration safety, Extended operator control, Factory/Field AP access policy.
