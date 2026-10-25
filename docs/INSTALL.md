# Offline installation and verification

## Target prerequisites

Ubuntu with `systemd`, `python3`, and `adduser`; the robot runtime package
should provide the QA utilities and ROS 2 overlay:

```bash
dpkg-query -W python3 systemd adduser
command -v turret-info turret-status turret-logs
systemctl status turret.service
```

## Install

Download the `turret-web-deb` artifact from GitHub Actions:

```bash
sudo apt install ./turret-web_0.4.0_all.deb
sudo systemctl status turret-web.service
journalctl -u turret-web.service -n 50 --no-pager
curl http://127.0.0.1:8080/api/status
```

Access on the Pi with a browser at `http://127.0.0.1:8080` or from a
workstation with an SSH tunnel:

```bash
ssh -L 8080:127.0.0.1:8080 ubuntu@PI_IP
```

The UI reads the latest 100 logs; status and logs refresh every 5 seconds.
ROS telemetry is sampled at 5 Hz. For live ROS data, `ROS_DISTRO` must be set
in `/usr/share/robot/environment/full.env`, and the robot overlay must exist
at `/opt/robot/ros`. If ROS is unavailable, the web service still starts and
reports that telemetry is unavailable.

The runtime packaging script generates `full.env` with `ROS_DISTRO` (default
`jazzy`), `ROS_DOMAIN_ID` (default `10`), and
`RMW_IMPLEMENTATION` (default `rmw_fastrtps_cpp`). The runtime DEB depends on
`ros-jazzy-ros-base` and packages its custom message overlay under
`/opt/robot/ros`. The Web UI DEB depends on `rob-app`, so its required ROS
runtime and custom messages must be installed, though `turret.service` may be
stopped.

After installation, verify ROS visibility in the service log and UI:

```bash
sudo systemctl restart turret-web.service
sudo journalctl -u turret-web.service -n 100 --no-pager
curl -s http://127.0.0.1:8080/api/diagnostics
```

Run the packaged preflight as the service user to verify required imports and
inspect topics visible in its ROS domain:

```bash
sudo -u turret-web /usr/bin/turret-web-ros-check
```

The web service also performs the ROS imports and subscriptions as `turret-web`.
A failed required import is returned as an explicit ROS-unavailable error;
absent topic publishers appear as missing/stale data in Diagnostics. The
preflight lists topics but does not fail when publishers are absent, since the
runtime may be stopped. This source workspace does not contain the deployed
`full.env` or `/opt/robot/ros` overlay, and does not have the `turret-web`
account, so the service-user check must be completed on a device with the
robot DEB installed.

The Overview tab provides confirmed Start, Stop, and Restart actions for
`turret.service`. Mock Mode disables all service actions.
The Info tab also shows non-loopback IPv4 addresses detected on the device.

System health metrics are read locally from Linux `/proc`, `/sys`, and
filesystem statistics. CPU temperature is shown only when an explicitly
identified CPU/SoC sensor is available. Main-battery charge is shown as a
runtime estimate derived from voltage, not as BMS SOC. Warnings are raised at
20% estimated battery charge, 80 °C CPU temperature, or less than 10% free
space on the root filesystem; temperature and disk thresholds are UI defaults,
not manufacturer-specified limits.

## Troubleshooting

- Missing JS/CSS: confirm `/opt/turret-web/static/assets` exists.
- Missing product information or logs: confirm the runtime package is installed
  and the three `turret-*` commands are available in the service user's `PATH`.
- ROS data unavailable: inspect `journalctl -u turret-web.service`, verify ROS
  2 and `/opt/robot/ros` are installed, check `ROS_DISTRO`, `ROS_DOMAIN_ID`,
  and `RMW_IMPLEMENTATION` in `/usr/share/robot/environment/full.env`, then
  check whether this model publishes the configured topics.
  `/joint_states` may not be published by every model.
- Empty logs: confirm `turret-web` is a member of `systemd-journal` and restart
  `turret-web.service` after a group membership change.
- Service action rejected: confirm `/etc/sudoers.d/turret-web` grants only
  the fixed Start/Stop/Restart commands for `turret.service` and inspect
  `journalctl -u turret-web.service`.

No factory AP setup, login, or TLS yet.

## Control prototype

The Control page is a mock-only v0.5 preview. Camera/profile and tool/mode
selections, joystick axes, and Motion Enable/Slow Mode switches change local
UI state only. Device status is explicitly unavailable. There is no RTSP
playback, ROS command publisher, homing service call, tool activation, or
device-side control handling; no additional target dependency is required.
Connection and device status labels are fixed preview placeholders, not live
backend or ROS state.
Settings remains unavailable.

The ROS workspace currently has no `WEB_UI` source registration or shared
control-owner lease exposed to this package. `/connection_status` is an
aggregated status and must not be overwritten to register the Web UI. Do not
connect the preview directly to shared actuation topics. A future integration
requires the shared Communication Layer / core application API and a
browser-compatible video gateway with a verified model-specific stream map.
