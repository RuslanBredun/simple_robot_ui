#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${ROS_DISTRO:-}" && -r "/opt/ros/${ROS_DISTRO}/setup.bash" ]]; then
    # shellcheck disable=SC1090
    source "/opt/ros/${ROS_DISTRO}/setup.bash"
else
    echo "[WARN] ROS 2 environment is unavailable; telemetry will report unavailable" >&2
fi

if [[ -r /opt/robot/ros/local_setup.bash ]]; then
    # shellcheck disable=SC1091
    source /opt/robot/ros/local_setup.bash
fi

exec /usr/bin/python3 /opt/turret-web/server.py
