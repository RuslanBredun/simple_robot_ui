#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${VERSION:-0.2.0}"
test -f "$ROOT/frontend/dist/index.html" || { echo "Build frontend first: npm run build" >&2; exit 1; }
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/DEBIAN" "$STAGE/opt/turret-web/static" "$STAGE/lib/systemd/system" "$STAGE/etc/sudoers.d" "$ROOT/dist"
cp "$ROOT/backend/server.py" "$STAGE/opt/turret-web/server.py"
cp -a "$ROOT/frontend/dist/." "$STAGE/opt/turret-web/static/"
cp "$ROOT/packaging/turret-web.service" "$STAGE/lib/systemd/system/"
cp "$ROOT/packaging/turret-web.sudoers" "$STAGE/etc/sudoers.d/turret-web"
chmod 0440 "$STAGE/etc/sudoers.d/turret-web"
cat > "$STAGE/DEBIAN/control" <<EOF
Package: turret-web
Version: $VERSION
Architecture: all
Section: admin
Priority: optional
Maintainer: Robot UI Team <noreply@example.invalid>
Depends: python3, systemd, sudo, adduser
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
