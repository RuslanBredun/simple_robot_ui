# Offline installation and verification

## Target prerequisites

Ubuntu with `systemd`, `python3`, `sudo`, `adduser`, and existing `turret.service`. Dependencies declared in DEB are OS prerequisites, not embedded, so verify before going offline:

```bash
dpkg-query -W python3 systemd sudo adduser
systemctl status turret.service
```

## Install

Download the `turret-web-deb` artifact from GitHub Actions and unzip it:

```bash
sudo apt install ./turret-web_0.2.0_all.deb
sudo systemctl status turret-web.service
journalctl -u turret-web.service -n 50 --no-pager
curl http://127.0.0.1:8080/api/status
```

Access on the Pi with browser at `http://127.0.0.1:8080` or from workstation with an SSH tunnel:

```bash
ssh -L 8080:127.0.0.1:8080 ubuntu@PI_IP
```

Open `http://127.0.0.1:8080` locally. Buttons act on `turret.service`. Logs show latest 200 lines, refreshed every 2.5 seconds.

## Troubleshooting

- Missing JS/CSS: confirm `/opt/turret-web/static/assets` exists.
- Stop/Restart failure: run `sudo visudo -cf /etc/sudoers.d/turret-web` and inspect `journalctl -u turret-web.service`.
- Empty logs: confirm `turret-web` account is in `systemd-journal` group and restart web service after group update.
- Python `NoNewPrivileges` must not be enabled while stop/restart use sudo. For production replace with a narrower privileged host-side RPC helper.
- Service status not active: confirm unit is exactly `turret.service`.

No factory AP setup, login, or TLS yet.
