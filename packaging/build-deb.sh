#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${VERSION:-0.5.1}"
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
Depends: python3, systemd, sudo, adduser, rob-app
Description: Local maintenance interface for turret.service
EOF
cat > "$STAGE/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
if ! id turret-web >/dev/null 2>&1; then
    adduser --system --group --no-create-home turret-web
fi
if getent group systemd-journal >/dev/null; then
    usermod -aG systemd-journal turret-web
fi
/usr/bin/python3 /usr/bin/turret-web-set-password init
if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
    systemctl daemon-reload
    systemctl enable --now turret-web.service
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
chmod 0755 "$STAGE/DEBIAN/postinst" "$STAGE/DEBIAN/prerm"
dpkg-deb --build --root-owner-group "$STAGE" "$ROOT/dist/turret-web_${VERSION}_all.deb"
