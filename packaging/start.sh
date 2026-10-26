#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${ROS_DISTRO:-}" && -r "/opt/ros/${ROS_DISTRO}/setup.bash" ]]; then
    # shellcheck disable=SC1090
    set +u
    source "/opt/ros/${ROS_DISTRO}/setup.bash"
    set -u
else
    echo "[WARN] ROS 2 environment is unavailable; telemetry will report unavailable" >&2
fi

if [[ -r /opt/robot/ros/local_setup.bash ]]; then
    # shellcheck disable=SC1091
    set +u
    source /opt/robot/ros/local_setup.bash
    set -u
fi

export ROS_HOME=/var/lib/turret-web/ros
export ROS_LOG_DIR=/var/lib/turret-web/ros
export FASTDDS_BUILTIN_TRANSPORTS="${TURRET_WEB_FASTDDS_BUILTIN_TRANSPORTS:-UDPv4}"
mkdir -p "$ROS_HOME" "$ROS_LOG_DIR"

exec /usr/bin/python3 /opt/turret-web/server.py
