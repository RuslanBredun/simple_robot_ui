"""Adapters for the read-only QA commands installed by the robot runtime."""
import re
import shutil
import subprocess
from datetime import datetime, timezone


class AdapterError(RuntimeError):
    pass


class QaCliAdapter:
    def __init__(self, mock=False):
        self.mock = mock

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
                    "VERSION": "0.4.0-dev",
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

    def logs(self):
        if self.mock:
            output = (
                "2026-01-01T00:00:00+00:00 robot mock_node[1234]: [INFO] Mock diagnostics active\n"
                "2026-01-01T00:00:01+00:00 robot mock_node[1234]: [WARN] Synthetic warning example\n"
            )
            return {"source": "mock", "text": output, "fetched_at": _now()}
        output = self._run("turret-logs", "-n", "100", "--no-pager")
        return {
            "source": "turret-logs",
            "text": output[-100000:],
            "fetched_at": _now(),
        }


def _now():
    return datetime.now(timezone.utc).isoformat()
