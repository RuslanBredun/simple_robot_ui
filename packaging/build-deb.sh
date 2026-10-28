#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${VERSION:-0.5.1}"
if ! dpkg --validate-version "$VERSION" >/dev/null 2>&1; then
  echo "Invalid Debian version: $VERSION" >&2; exit 1
fi
BUILD_DATE="$(date -u +%F)"
test -f "$ROOT/frontend/dist/index.html" || { echo "Build frontend first: npm run build" >&2; exit 1; }
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/DEBIAN" "$STAGE/opt/turret-web/static" "$STAGE/lib/systemd/system" "$STAGE/etc/default" "$STAGE/etc/sudoers.d" "$STAGE/usr/bin" "$ROOT/dist"
cp "$ROOT/backend/server.py" "$STAGE/opt/turret-web/server.py"
cp "$ROOT/backend/auth.py" "$STAGE/opt/turret-web/auth.py"
printf '{"build_date":"%s"}\n' "$BUILD_DATE" > "$STAGE/opt/turret-web/build-info.json"
mkdir -p "$STAGE/opt/turret-web/adapters"
cp "$ROOT"/backend/adapters/*.py "$STAGE/opt/turret-web/adapters/"
cp "$ROOT/packaging/start.sh" "$STAGE/opt/turret-web/start.sh"
chmod 0755 "$STAGE/opt/turret-web/start.sh"
cp "$ROOT/packaging/turret-web-ros-check" "$STAGE/usr/bin/turret-web-ros-check"
chmod 0755 "$STAGE/usr/bin/turret-web-ros-check"
cp "$ROOT/packaging/turret-web-set-password" "$STAGE/usr/bin/turret-web-set-password"
chmod 0755 "$STAGE/usr/bin/turret-web-set-password"
cp -a "$ROOT/frontend/dist/." "$STAGE/opt/turret-web/static/"
cp "$ROOT/packaging/turret-web.service" "$STAGE/lib/systemd/system/"
cp "$ROOT/packaging/turret-web.default" "$STAGE/etc/default/turret-web"
cp "$ROOT/packaging/turret-web.sudoers" "$STAGE/etc/sudoers.d/turret-web"
chmod 0440 "$STAGE/etc/sudoers.d/turret-web"
printf '/etc/default/turret-web\n' > "$STAGE/DEBIAN/conffiles"
cat > "$STAGE/DEBIAN/control" <<EOF
Package: turret-web
Version: $VERSION
Architecture: all
Section: admin
Priority: optional
Maintainer: Robot UI Team <noreply@example.invalid>
Depends: python3, systemd, sudo, adduser, debconf, rob-app
Description: Local maintenance interface for turret.service
EOF
cat > "$STAGE/DEBIAN/templates" <<'EOF'
Template: turret-web/password-mode
Type: select
Choices: Custom password, Factory default (service1), Generate random password
Default: Custom password
Description: Choose initial Robot Web UI password:
 The factory default service1 is shared across devices and must only be used
 during trusted factory provisioning. Change it before field deployment.
 .
 Unattended installations use a unique random password.

Template: turret-web/password
Type: password
Description: Password for Robot Web UI:
 Enter a new password with at least 8 characters.

Template: turret-web/password-confirm
Type: password
Description: Confirm Robot Web UI password:
 Re-enter the custom password.

Template: turret-web/password-mismatch
Type: error
Description: Robot Web UI passwords do not match
 The password and confirmation must be identical. Please try again.

Template: turret-web/password-too-short
Type: error
Description: Robot Web UI password is too short
 Use at least 8 characters.
EOF
cat > "$STAGE/DEBIAN/config" <<'EOF'
#!/bin/sh
set -e
. /usr/share/debconf/confmodule
if [ ! -f /var/lib/turret-web/auth.json ]; then
    db_input high turret-web/password-mode || true
    db_go || true
    db_get turret-web/password-mode
    mode="$RET"
    # No interactive terminal: never install the shared factory password.
    if [ "${DEBIAN_FRONTEND:-}" = "noninteractive" ]; then
        mode="Generate random password"
    fi
    if [ "$mode" = "Custom password" ]; then
        while :; do
            db_input high turret-web/password || true
            db_input high turret-web/password-confirm || true
            db_go || true
            db_get turret-web/password
            password="$RET"
            db_get turret-web/password-confirm
            confirmation="$RET"
            if [ "$password" != "$confirmation" ]; then
                db_input critical turret-web/password-mismatch || true
            elif [ "${#password}" -lt 8 ]; then
                db_input critical turret-web/password-too-short || true
            else
                break
            fi
            db_go || true
            db_reset turret-web/password
            db_reset turret-web/password-confirm
        done
    fi
fi
exit 0
EOF
cat > "$STAGE/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
. /usr/share/debconf/confmodule
if ! id turret-web >/dev/null 2>&1; then
    adduser --system --group --no-create-home turret-web
fi
if getent group systemd-journal >/dev/null; then
    usermod -aG systemd-journal turret-web
fi
if [ ! -f /var/lib/turret-web/auth.json ]; then
    db_get turret-web/password-mode
    mode="$RET"
    if [ "${DEBIAN_FRONTEND:-}" = "noninteractive" ]; then
        mode="Generate random password"
    fi
    case "$mode" in
        "Factory default (service1)")
            /usr/bin/python3 /usr/bin/turret-web-set-password factory-default ;;
        "Custom password")
            db_get turret-web/password
            password="$RET"
            if [ "${#password}" -lt 8 ]; then
                echo "Custom password missing or too short" >&2
                exit 1
            fi
            printf '%s\n' "$password" | /usr/bin/python3 /usr/bin/turret-web-set-password set-stdin
            unset password ;;
        *)
            /usr/bin/python3 /usr/bin/turret-web-set-password init ;;
    esac
fi
db_reset turret-web/password-mode || true
db_reset turret-web/password || true
db_reset turret-web/password-confirm || true
if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
    systemctl daemon-reload
    systemctl enable turret-web.service
    systemctl restart turret-web.service
fi
EOF
cat > "$STAGE/DEBIAN/prerm" <<'EOF'
#!/bin/sh
set -e
if [ "$1" = remove ] || [ "$1" = deconfigure ]; then
    systemctl stop turret-web.service || true
    systemctl disable turret-web.service || true
fi
EOF
chmod 0755 "$STAGE/DEBIAN/postinst" "$STAGE/DEBIAN/prerm" "$STAGE/DEBIAN/config"
dpkg-deb --build --root-owner-group "$STAGE" "$ROOT/dist/turret-web_${VERSION}_all.deb"
