"""Read-only system health metrics from the local operating system."""
import glob
import os
import platform
import random
import shutil
import socket
import struct
import time
from pathlib import Path


class SystemMetricsAdapter:
    def __init__(self, mock=False):
        self.mock = mock
        self._previous_cpu = None
        self._thermal_path = None
        self._thermal_checked = False
        self._mock_last = time.monotonic()
        self._mock = {
            "cpu_percent": 22.0,
            "memory_percent": 48.0,
            "cpu_temperature_c": 48.0,
            "disk_percent": 37.0,
            "disk_total_bytes": 64 * 1024**3,
            "uptime_seconds": 86400,
        }

    def identity(self):
        if self.mock:
            return {
                "hostname": "mock-robot",
                "os_name": "Ubuntu (mock)",
                "architecture": "aarch64",
                "network_interfaces": [
                    {"name": "eth0", "ipv4_address": "192.168.1.42"},
                ],
                "errors": {},
            }
        os_name = None
        errors = {}
        try:
            for line in Path("/etc/os-release").read_text(encoding="utf-8").splitlines():
                key, separator, value = line.partition("=")
                if key == "PRETTY_NAME" and separator:
                    os_name = value.strip().strip('"')
                    break
            if os_name is None:
                errors["os_name"] = "PRETTY_NAME is missing from /etc/os-release"
        except OSError as exc:
            errors["os_name"] = str(exc)
        hostname = platform.node() or None
        architecture = platform.machine() or None
        network_interfaces = None
        try:
            network_interfaces = self._read_network_interfaces()
            if not network_interfaces:
                errors["network"] = "No non-loopback IPv4 addresses are available"
        except (OSError, ImportError) as exc:
            errors["network"] = str(exc)
        if hostname is None:
            errors["hostname"] = "Hostname is unavailable"
        if architecture is None:
            errors["architecture"] = "CPU architecture is unavailable"
        return {
            "hostname": hostname,
            "os_name": os_name,
            "architecture": architecture,
            "network_interfaces": network_interfaces,
            "errors": errors,
        }

    @staticmethod
    def _read_network_interfaces():
        import errno
        import fcntl

        addresses = []
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            for _, name in socket.if_nameindex():
                if name == "lo":
                    continue
                request = struct.pack("256s", name[:15].encode("utf-8"))
                try:
                    result = fcntl.ioctl(sock.fileno(), 0x8915, request)
                except OSError as exc:
                    if exc.errno in {errno.EADDRNOTAVAIL, errno.ENODEV, errno.ENXIO}:
                        continue
                    raise
                address = socket.inet_ntoa(result[20:24])
                if not address.startswith("127."):
                    addresses.append({"name": name, "ipv4_address": address})
        return addresses

    @staticmethod
    def _read_memory():
        values = {}
        for line in Path("/proc/meminfo").read_text(encoding="ascii").splitlines():
            key, separator, value = line.partition(":")
            if separator:
                fields = value.split()
                if fields and fields[0].isdigit():
                    values[key] = int(fields[0]) * 1024
        total = values.get("MemTotal")
        available = values.get("MemAvailable")
        if total is None or available is None or total <= 0:
            raise ValueError("MemTotal or MemAvailable is unavailable")
        used = total - available
        return used, total

    def _read_cpu_percent(self):
        lines = Path("/proc/stat").read_text(encoding="ascii").splitlines()
        if not lines:
            raise ValueError("CPU counters are unavailable")
        line = lines[0]
        fields = line.split()
        if not fields or fields[0] != "cpu" or len(fields) < 5:
            raise ValueError("CPU counters are unavailable")
        counters = [int(value) for value in fields[1:]]
        idle = counters[3] + (counters[4] if len(counters) > 4 else 0)
        total = sum(counters[:8])
        previous = self._previous_cpu
        self._previous_cpu = (idle, total)
        if previous is None:
            return None
        idle_delta = idle - previous[0]
        total_delta = total - previous[1]
        if total_delta <= 0:
            raise ValueError("CPU counters did not advance")
        return max(0.0, min(100.0, (1 - idle_delta / total_delta) * 100))

    @staticmethod
    def _find_cpu_thermal_path():
        for path in glob.glob("/sys/class/thermal/thermal_zone*/temp"):
            zone_type = Path(path).parent / "type"
            try:
                label = zone_type.read_text(encoding="ascii").strip().lower()
            except OSError:
                continue
            if "cpu" in label or "soc" in label or "bcm" in label:
                return path
        for path in glob.glob("/sys/class/hwmon/hwmon*/temp*_input"):
            label_path = path.removesuffix("_input") + "_label"
            try:
                label = Path(label_path).read_text(encoding="ascii").strip().lower()
            except OSError:
                continue
            if "cpu" in label or "soc" in label or "core" in label:
                return path
        return None

    def _read_cpu_temperature(self):
        if not self._thermal_checked:
            self._thermal_path = self._find_cpu_thermal_path()
            self._thermal_checked = True
        if self._thermal_path is None:
            raise FileNotFoundError("CPU temperature sensor is not available")
        raw = int(Path(self._thermal_path).read_text(encoding="ascii").strip())
        temperature = raw / 1000.0
        if temperature < -20 or temperature > 150:
            raise ValueError("CPU temperature sensor returned an invalid value")
        return temperature

    def snapshot(self):
        if self.mock:
            self._mock["cpu_percent"] = max(
                2.0, min(95.0, self._mock["cpu_percent"] + random.uniform(-4, 4))
            )
            self._mock["memory_percent"] = max(
                20.0, min(85.0, self._mock["memory_percent"] + random.uniform(-1.5, 1.5))
            )
            self._mock["cpu_temperature_c"] = max(
                35.0, min(82.0, self._mock["cpu_temperature_c"] + random.uniform(-1, 1))
            )
            now = time.monotonic()
            self._mock["uptime_seconds"] += max(0, int(now - self._mock_last))
            self._mock_last = now
            total = self._mock["disk_total_bytes"]
            disk_used = int(total * self._mock["disk_percent"] / 100)
            memory_total = 8 * 1024**3
            memory_used = int(memory_total * self._mock["memory_percent"] / 100)
            return {
                "cpu_percent": round(self._mock["cpu_percent"], 1),
                "memory_used_bytes": memory_used,
                "memory_total_bytes": memory_total,
                "memory_percent": round(self._mock["memory_percent"], 1),
                "cpu_temperature_c": round(self._mock["cpu_temperature_c"], 1),
                "disk_used_bytes": disk_used,
                "disk_total_bytes": total,
                "disk_free_bytes": total - disk_used,
                "disk_percent": self._mock["disk_percent"],
                "filesystem_read_only": False,
                "uptime_seconds": self._mock["uptime_seconds"],
                "errors": {},
            }

        result = {
            "cpu_percent": None,
            "memory_used_bytes": None,
            "memory_total_bytes": None,
            "memory_percent": None,
            "cpu_temperature_c": None,
            "disk_used_bytes": None,
            "disk_total_bytes": None,
            "disk_free_bytes": None,
            "disk_percent": None,
            "uptime_seconds": None,
            "errors": {},
        }

        try:
            result["cpu_percent"] = self._read_cpu_percent()
        except (OSError, ValueError, IndexError) as exc:
            result["errors"]["cpu_percent"] = str(exc)

        try:
            used, total = self._read_memory()
            result.update({
                "memory_used_bytes": used,
                "memory_total_bytes": total,
                "memory_percent": round(used / total * 100, 1),
            })
        except (OSError, ValueError) as exc:
            result["errors"]["memory"] = str(exc)

        try:
            result["cpu_temperature_c"] = round(self._read_cpu_temperature(), 1)
        except (OSError, ValueError) as exc:
            result["errors"]["cpu_temperature_c"] = str(exc)

        try:
            usage = shutil.disk_usage("/")
            filesystem = os.statvfs("/")
            result.update({
                "disk_used_bytes": usage.used,
                "disk_total_bytes": usage.total,
                "disk_free_bytes": usage.free,
                "disk_percent": round(usage.used / usage.total * 100, 1),
                "filesystem_read_only": bool(
                    filesystem.f_flag & getattr(os, "ST_RDONLY", 1)
                ),
            })
        except OSError as exc:
            result["errors"]["disk"] = str(exc)

        try:
            result["uptime_seconds"] = int(float(Path("/proc/uptime").read_text().split()[0]))
        except (OSError, ValueError, IndexError) as exc:
            result["errors"]["uptime"] = str(exc)

        return result
