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
sudo apt install ./turret-web_0.5.0_all.deb
sudo systemctl status turret-web.service
journalctl -u turret-web.service -n 50 --no-pager
curl http://127.0.0.1:8080/api/status
```

The shipped defaults allow LAN access at `http://192.168.88.56:8080`.
To change the network listener without reinstalling, edit
`/etc/default/turret-web`:

```bash
sudoedit /etc/default/turret-web
```

The default values are:

```bash
TURRET_WEB_HOST=0.0.0.0
TURRET_WEB_PORT=8080
TURRET_WEB_ALLOWED_HOSTS=192.168.88.56
TURRET_WEB_MODE=real
```

`TURRET_WEB_HOST` is the bind address; `0.0.0.0` listens on all interfaces, or use a
specific Pi interface address. `TURRET_WEB_ALLOWED_HOSTS` is a comma-separated
list of hostnames/IP addresses clients may use in the URL; it does not include
the port. Both the listener and allowlist must permit LAN access. `TURRET_WEB_MODE`
is `real` or `mock`. Keep `real` for the installed device.

Apply changes with `sudo systemctl restart turret-web.service`, then open
`http://192.168.88.56:8080` from the workstation. If a previous systemd
override sets these `TURRET_WEB_*` variables, remove those entries so
`/etc/default/turret-web` is the single source of truth. Restrict the port to
a trusted network; the UI has no login.

The UI reads the latest 100 logs; status and logs refresh every 5 seconds.
ROS telemetry is sampled at 5 Hz. For live ROS data, `ROS_DISTRO` and the
runtime ROS paths must be set in `/usr/share/robot/environment/full.env`, and
the packaged message overlay must exist at `/opt/robot/ros`. The runtime
package may provide this selective overlay without a top-level
`local_setup.bash`; the Web UI uses the paths from `full.env` and sources the
ROS distribution setup. If ROS is unavailable, the web service still starts
and reports that telemetry is unavailable.
The System charts show Raspberry Pi CPU, RAM, and temperature. Axes and Motors
charts require live ROS topics; they remain empty if the runtime does not
publish those topics or the Web UI cannot discover them.

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
inspect topics visible in its ROS domain. The top-level robot overlay
`local_setup.bash` is optional when its installed paths are already configured
in `full.env`:

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
robot DEB installed. The Web UI redirects its ROS logs to its private writable
state directory `/var/lib/turret-web/ros`; it does not write into the runtime's
`/var/log/robot/ros`.

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

The Control page displays live, read-only ROS diagnostics for operator
connection, turret mode, and weapon mode. Status older than two seconds is
shown as unavailable; `/connection_status` is aggregated and cannot identify
the active source or control owner. Camera/profile and tool/mode selections,
joystick axes, and Enable/Slow switches remain local UI state only.
Run Homing, fuse, and activation buttons are disabled. There is no RTSP
playback, ROS command publisher, homing service call, tool activation, or
device-side control handling; no additional target dependency is required.
Settings remains unavailable.

The ROS workspace currently has no `WEB_UI` source registration or shared
control-owner lease exposed to this package. `/connection_status` is an
aggregated status and must not be overwritten to register the Web UI. Do not
connect the preview directly to shared actuation topics. A future integration
requires the shared Communication Layer / core application API and a
browser-compatible video gateway with a verified model-specific stream map.
