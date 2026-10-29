"""Adapters for the read-only QA commands installed by the robot runtime."""
import os
import re
import shutil
import subprocess
from datetime import datetime, timedelta, timezone


class AdapterError(RuntimeError):
    pass


LOG_RANGES = {
    "startup": None,
    "15m": "15 minutes ago",
    "1h": "1 hour ago",
    "6h": "6 hours ago",
    "24h": "24 hours ago",
}
MOCK_LOG_RANGE_DURATIONS = {
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
}
MOCK_LOG_ENTRIES = (
    (timedelta(0), "turret_main[1234]: [INFO] Application startup complete; model=mock_turret"),
    (timedelta(minutes=15), "canopen_manager[1238]: [INFO] CAN bus initialized; 4 devices detected"),
    (timedelta(hours=1), "axis_controller[1241]: [INFO] X and Y axes are ready"),
    (timedelta(hours=3), "sensor_bridge[1250]: [WARN] IMU data delayed by 120 ms"),
    (timedelta(hours=6), "turret_main[1234]: [INFO] Operator connection established"),
    (timedelta(hours=10), "axis_controller[1241]: [WARN] Following error elevated on Y axis"),
    (timedelta(hours=11), "battery_monitor[1257]: [INFO] Battery voltage 25.1 V"),
    (timedelta(hours=11, minutes=15), "sensor_bridge[1250]: [ERROR] Camera frame timeout; reconnecting"),
    (timedelta(hours=11, minutes=45), "sensor_bridge[1250]: [INFO] Camera stream restored"),
    (timedelta(hours=11, minutes=52), "turret_main[1234]: [INFO] Operation state changed to IDLE"),
    (timedelta(hours=11, minutes=56), "canopen_manager[1238]: [WARN] Motor temperature reached 58.2 C"),
    (timedelta(hours=11, minutes=59), "turret_main[1234]: [INFO] Diagnostics snapshot published"),
)


class QaCliAdapter:
    def __init__(self, mock=False):
        self.mock = mock
        self._mock_logs_at = datetime.now(timezone.utc)
        self._mock_logs_started_at = self._mock_logs_at - timedelta(hours=12)
        self._mock_logs = [
            (
                self._mock_logs_started_at + elapsed,
                f"{(self._mock_logs_started_at + elapsed).isoformat()} robot {message}",
            )
            for elapsed, message in MOCK_LOG_ENTRIES
        ]

    def _run(self, command, *args):
        executable = shutil.which(command)
        if not executable:
            raise AdapterError(f"{command} is not installed or not available in PATH")
        try:
            result = subprocess.run(
                [executable, *args],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise AdapterError(f"{command} timed out") from exc
        except OSError as exc:
            raise AdapterError(f"Could not run {command}: {exc}") from exc
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip()
            raise AdapterError(f"{command} exited with {result.returncode}: {detail}")
        return result.stdout

    @staticmethod
    def parse_fields(output):
        fields = {}
        for line in output.splitlines():
            match = re.match(r"^\s*([A-Za-z][A-Za-z0-9 _-]*?)\s*:\s*(.*?)\s*$", line)
            if match:
                fields[match.group(1).strip()] = match.group(2)
        return fields

    def info(self):
        if self.mock:
            return {
                "source": "mock",
                "fields": {
                    "VERSION": "0.5.0-dev",
                    "MODEL": "mock_turret",
                    "BUILD DATE": "2026-01-01",
                    "SERIAL": "MOCK-0000",
                    "MAC ETH0": "00:00:00:00:00:00",
                    "ROBOT SERVICE": "ACTIVE",
                    "PACKAGE": "rob-app 0.0.0~mock",
                    "PKG STATUS": "ii",
                },
            }
        output = self._run("turret-info")
        fields = self.parse_fields(output)
        if not fields:
            raise AdapterError("turret-info returned no parseable fields")
        return {"source": "turret-info", "fields": fields}

    def status(self):
        if self.mock:
            output = "SERVICE    : turret.service\nACTIVE     : active\nENABLED    : enabled\nSUBSTATE   : running\nMAIN PID   : 1234\n"
            return {"source": "mock", "text": output}
        return {"source": "turret-status", "text": self._run("turret-status")}

    def logs(self, time_range="1h"):
        if time_range not in LOG_RANGES:
            raise AdapterError("Unsupported log time range")
        if self.mock:
            since = self._mock_logs_started_at if time_range == "startup" else (
                self._mock_logs_at - MOCK_LOG_RANGE_DURATIONS[time_range]
            )
            output = "\n".join(
                line for timestamp, line in self._mock_logs if timestamp >= since
            )
            if output:
                output += "\n"
            return {"source": "mock", "text": output, "fetched_at": _now()}
        since = LOG_RANGES[time_range]
        if time_range == "startup":
            service = os.environ.get("ROBOT_SERVICE_NAME", "turret.service")
            # systemctl's human-readable timestamp (e.g. "Thu ... EET")
            # is not a valid journalctl --since argument. Use epoch seconds.
            timestamp = self._run(
                "systemctl", "show", "--property=ActiveEnterTimestampUSec", "--value", service
            ).strip()
            try:
                # systemctl may return a human-readable timestamp even for
                # ActiveEnterTimestampUSec; use monotonic-free numeric data
                # from show --property=...TimestampMonotonic only if needed.
                from datetime import datetime as _datetime
                if timestamp.isdigit():
                    since = f"@{int(timestamp) // 1000000}"
                else:
                    import email.utils
                    parsed = email.utils.parsedate_to_datetime(timestamp)
                    if parsed is None or parsed.tzinfo is None:
                        raise ValueError("timestamp has no timezone")
                    since = f"@{int(parsed.timestamp())}"
            except (ValueError, TypeError, OverflowError) as exc:
                raise AdapterError(f"Could not parse the last start time of {service}: {timestamp}") from exc
        args = ["--since", since]
        if time_range != "startup":
            args.extend(["-n", "100"])
        output = self._run(
            "turret-logs", *args, "--no-pager"
        )
        return {
            "source": "turret-logs",
            "text": output[:100000] if time_range == "startup" else output[-100000:],
            "fetched_at": _now(),
        }


def _now():
    return datetime.now(timezone.utc).isoformat()
