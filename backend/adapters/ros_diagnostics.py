"""Read-only ROS 2 topic adapter with an explicit unavailable state."""
import os
import random
import threading
import time
from datetime import datetime, timezone


def _now():
    return datetime.now(timezone.utc).isoformat()


class RosDiagnosticsAdapter:
    DEFAULT_MOTOR_TOPICS = (
        "/x_axis/state",
        "/y_axis/state",
        "/camera/x_axis/state",
        "/camera/y_axis/state",
    )

    def __init__(self, mock=False):
        self.mock = mock
        self._lock = threading.Lock()
        self._state = {
            "available": False,
            "error": "ROS diagnostics have not started",
            "motors": {},
            "joints": {},
            "modes": {},
            "connection": {"connected": None},
            "gimbal": None,
            "gimbal_error": None,
            "battery": None,
            "battery_error": None,
            "sensors": None,
            "sensors_error": None,
        }
        self._thread = None
        self._stop = threading.Event()
        self._node = None
        self._rclpy = None

    def start(self):
        if self.mock:
            self._state = {
                "available": True,
                "error": None,
                "motors": {
                    "/x_axis/state": {
                        "current": 1.2, "position": 1200, "rpm": 60,
                        "voltage": 24.1, "temperature": 38, "received_at": _now(),
                        "drive_status": "READY", "operational": True,
                        "motor_fault_alarm": False, "alarm_code": 0,
                    },
                    "/y_axis/state": {
                        "current": 0.8, "position": 850, "rpm": 22,
                        "voltage": 24.0, "temperature": 36, "received_at": _now(),
                        "drive_status": "READY", "operational": True,
                        "motor_fault_alarm": False, "alarm_code": 0,
                    },
                },
                "joints": {
                    "turret_yaw_joint": {"position": 0.2, "velocity": 0.03, "received_at": _now()},
                    "turret_pitch_joint": {"position": -0.1, "velocity": -0.02, "received_at": _now()},
                },
                "modes": {
                    "weapon": {"mode": "UNARMED", "received_at": _now()},
                },
                "connection": {"connected": True, "received_at": _now()},
                "gimbal": {
                    "mode": "MANUAL",
                    "operation_type": "NONE",
                    "operation_state": "IDLE",
                    "message": "",
                    "received_at": _now(),
                },
                "gimbal_error": None,
                "battery": {
                    "voltage_v": 24.5,
                    "charge_percent": 71.0,
                    "is_live": True,
                    "received_at": _now(),
                },
                "battery_error": None,
                "sensors": {
                    "aggregated_state": "HEALTHY",
                    "items": [
                        {"name": "Base IMU", "state": "HEALTHY"},
                        {"name": "Inclinometer", "state": "HEALTHY"},
                    ],
                    "received_at": _now(),
                },
                "sensors_error": None,
            }
            return
        self._thread = threading.Thread(target=self._spin, name="ros-diagnostics", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._rclpy is not None and self._rclpy.ok():
            self._rclpy.shutdown()
        if self._thread is not None:
            self._thread.join(timeout=2)

    def _spin(self):
        try:
            import rclpy
            from rclpy.node import Node
            from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
            from sensor_msgs.msg import JointState
            from std_msgs.msg import Bool
            from rob_turret_msgs.msg import CANOpenMotorState, WeaponState
        except ImportError as exc:
            with self._lock:
                self._state["error"] = f"ROS 2 diagnostics unavailable: {exc}"
            return

        try:
            from rob_turret_msgs.msg import GimbalState
            gimbal_state_type = GimbalState
            gimbal_error = None
        except ImportError as exc:
            gimbal_state_type = None
            gimbal_error = f"GimbalState message unavailable: {exc}"

        try:
            from rob_comm_msgs.msg import UARTTelemetry
            uart_telemetry_type = UARTTelemetry
            battery_error = None
        except ImportError as exc:
            uart_telemetry_type = None
            battery_error = f"Battery telemetry unavailable: {exc}"

        try:
            from rob_telem_msgs.msg import SensorHealthReport
            sensor_health_type = SensorHealthReport
            sensors_error = None
        except ImportError as exc:
            sensor_health_type = None
            sensors_error = f"Sensor health unavailable: {exc}"

        self._rclpy = rclpy
        try:
            if not rclpy.ok():
                rclpy.init(args=None)
            node = Node("turret_web_diagnostics")
            self._node = node
            state_qos = QoSProfile(
                depth=1,
                reliability=ReliabilityPolicy.RELIABLE,
                durability=DurabilityPolicy.TRANSIENT_LOCAL,
            )
            topics = [
                item.strip()
                for item in os.environ.get(
                    "TURRET_WEB_MOTOR_TOPICS", ",".join(self.DEFAULT_MOTOR_TOPICS)
                ).split(",")
                if item.strip()
            ]
            for topic in topics:
                node.create_subscription(
                    CANOpenMotorState,
                    topic,
                    lambda msg, name=topic: self._motor_callback(name, msg),
                    10,
                )
            node.create_subscription(JointState, "/joint_states", self._joint_callback, 10)
            node.create_subscription(WeaponState, "/weapon_state", self._weapon_callback, state_qos)
            node.create_subscription(Bool, "/connection_status", self._connection_callback, state_qos)
            if gimbal_state_type is not None:
                node.create_subscription(
                    gimbal_state_type, "/gimbal_state", self._gimbal_callback, state_qos
                )
            with self._lock:
                self._state["gimbal_error"] = gimbal_error
                self._state["battery_error"] = battery_error
                self._state["sensors_error"] = sensors_error
            if uart_telemetry_type is not None:
                node.create_subscription(
                    uart_telemetry_type, "/uart_telemetry", self._battery_callback, 10
                )
            if sensor_health_type is not None:
                node.create_subscription(
                    sensor_health_type, "/telemetry/sensors_health",
                    self._sensor_health_callback, 10
                )
            with self._lock:
                self._state.update({"available": True, "error": None})
            while rclpy.ok() and not self._stop.is_set():
                rclpy.spin_once(node, timeout_sec=0.1)
        except Exception as exc:
            if not self._stop.is_set():
                with self._lock:
                    self._state.update({"available": False, "error": f"ROS 2 diagnostics failed: {exc}"})
        finally:
            if self._node is not None:
                self._node.destroy_node()
                self._node = None
            if rclpy.ok():
                rclpy.shutdown()

    def _motor_callback(self, topic, message):
        telemetry = getattr(message, "telemetry", message)
        diagnostics = getattr(message, "diagnostics", None)
        current_ma = getattr(telemetry, "current", None)
        item = {
            "position": getattr(telemetry, "position", None),
            "current": round(current_ma / 1000.0, 3) if isinstance(current_ma, (int, float)) else None,
            "rpm": getattr(telemetry, "rpm", None),
            "voltage": getattr(telemetry, "voltage", None),
            "temperature": getattr(telemetry, "temperature", None),
            "received_at": _now(),
        }
        if diagnostics is not None:
            drive_states = {
                0: "IDLE",
                1: "BOOTING",
                2: "CONFIGURING",
                3: "READY",
                4: "FAULT",
                5: "STOPPED",
            }
            state = getattr(diagnostics, "state", None)
            motor_fault = getattr(diagnostics, "motor_fault_alarm", None)
            operational = getattr(diagnostics, "operational", None)
            if motor_fault or state == 4:
                drive_status = "FAULT"
            elif state == 3 and operational is True:
                drive_status = "READY"
            else:
                drive_status = drive_states.get(state, "UNKNOWN")
                if state == 3:
                    drive_status = "UNKNOWN"
            item.update({
                "alarm_code": getattr(diagnostics, "alarm_code", None),
                "status_word": getattr(diagnostics, "status_word", None),
                "state": state,
                "drive_status": drive_status,
                "operational": operational,
                "motor_fault_alarm": motor_fault,
                "battery_power_down_alarm": getattr(
                    diagnostics, "battery_power_down_alarm", None
                ),
            })
        with self._lock:
            self._state["motors"][topic] = item

    def _battery_callback(self, message):
        voltage_raw = getattr(message, "battery_voltage", None)
        with self._lock:
            self._state["battery"] = {
                "voltage_v": voltage_raw / 100.0
                if isinstance(voltage_raw, (int, float)) else None,
                "charge_percent": getattr(message, "battery_percent", None),
                "is_live": bool(getattr(message, "is_live", False)),
                "received_at": _now(),
            }
            self._state["battery_error"] = None

    def _sensor_health_callback(self, message):
        states = {
            0: "UNKNOWN",
            1: "PRESENT",
            2: "HEALTHY",
            3: "DEGRADED",
            4: "FAILED",
        }
        with self._lock:
            self._state["sensors"] = {
                "aggregated_state": states.get(
                    message.aggregated_state,
                    f"UNKNOWN ({message.aggregated_state})",
                ),
                "items": [
                    {
                        "name": item.name,
                        "state": states.get(item.state, f"UNKNOWN ({item.state})"),
                    }
                    for item in message.sensor_states
                ],
                "received_at": _now(),
            }
            self._state["sensors_error"] = None

    def _joint_callback(self, message):
        velocities = list(getattr(message, "velocity", []))
        received_at = _now()
        with self._lock:
            for index, (name, position) in enumerate(zip(message.name, message.position)):
                item = {"position": position, "received_at": received_at}
                if index < len(velocities):
                    item["velocity"] = velocities[index]
                self._state["joints"][name] = item

    def _weapon_callback(self, message):
        modes = {
            0: "UNKNOWN",
            1: "UNARMED",
            2: "ARMING",
            3: "ARMED",
            4: "FIRING",
            5: "FIRING_ROUND_COMPLETE",
            6: "ERROR",
            7: "SERVICE",
        }
        operation_types = {0: "NONE", 1: "RECHARGING", 2: "CALIBRATING"}
        operation_states = {
            0: "IDLE",
            1: "RUNNING",
            2: "PAUSED",
            3: "COMPLETED",
            4: "FAILED",
        }
        with self._lock:
            self._state["modes"]["weapon"] = {
                "mode": modes.get(message.mode, f"UNKNOWN ({message.mode})"),
                "operation_type": operation_types.get(
                    message.operation_type, f"UNKNOWN ({message.operation_type})"
                ),
                "operation_state": operation_states.get(
                    message.operation_state, f"UNKNOWN ({message.operation_state})"
                ),
                "message": getattr(message, "message", ""),
                "received_at": _now(),
            }

    def _connection_callback(self, message):
        with self._lock:
            self._state["connection"] = {
                "connected": bool(message.data),
                "received_at": _now(),
            }

    def _gimbal_callback(self, message):
        modes = {
            0: "UNKNOWN",
            1: "DISABLED",
            2: "HOLD",
            3: "MANUAL",
            4: "POINTING",
            5: "PROCEDURE",
        }
        operation_types = {0: "NONE", 1: "HOMING"}
        operation_states = {
            0: "IDLE",
            1: "RUNNING",
            2: "PAUSED",
            3: "STOPPED",
            4: "FINISHED",
            5: "FAILED",
        }
        with self._lock:
            self._state["gimbal"] = {
                "mode": modes.get(message.mode, f"UNKNOWN ({message.mode})"),
                "operation_type": operation_types.get(
                    message.operation_type, f"UNKNOWN ({message.operation_type})"
                ),
                "operation_state": operation_states.get(
                    message.operation_state, f"UNKNOWN ({message.operation_state})"
                ),
                "message": getattr(message, "message", ""),
                "received_at": _now(),
            }
            self._state["gimbal_error"] = None

    def snapshot(self):
        with self._lock:
            if self.mock:
                received_at = _now()
                for item in self._state["motors"].values():
                    item["current"] = round(max(0, min(5, item["current"] + random.uniform(-0.12, 0.12))), 2)
                    item["position"] += round(random.uniform(-8, 8))
                    item["rpm"] = round(max(0, item["rpm"] + random.uniform(-4, 4)))
                    item["received_at"] = received_at
                for item in self._state["joints"].values():
                    item["position"] = round(max(-1.5, min(1.5, item["position"] + random.uniform(-0.025, 0.025))), 3)
                    item["velocity"] = round(random.uniform(-0.12, 0.12), 3)
                    item["received_at"] = received_at
                for item in self._state["modes"].values():
                    item["received_at"] = received_at
                self._state["connection"]["received_at"] = received_at
                if self._state["gimbal"] is not None:
                    self._state["gimbal"]["received_at"] = received_at
                if self._state["battery"] is not None:
                    self._state["battery"]["voltage_v"] = round(max(
                        20, min(29, self._state["battery"]["voltage_v"] + random.uniform(-0.08, 0.08))
                    ), 2)
                    self._state["battery"]["charge_percent"] = round(max(
                        0, min(100, self._state["battery"]["charge_percent"] + random.uniform(-0.5, 0.5))
                    ), 1)
                    self._state["battery"]["received_at"] = received_at
                for item in self._state["motors"].values():
                    item["voltage"] = round(max(18, min(30, item["voltage"] + random.uniform(-0.2, 0.2))), 2)
                    item["temperature"] = round(max(20, min(90, item["temperature"] + random.uniform(-0.8, 0.8))), 1)
                if self._state["sensors"] is not None:
                    self._state["sensors"]["received_at"] = received_at
            result = {
                **self._state,
                "motors": {name: dict(item) for name, item in self._state["motors"].items()},
                "joints": {name: dict(item) for name, item in self._state["joints"].items()},
                "modes": {name: dict(item) for name, item in self._state["modes"].items()},
                "connection": dict(self._state["connection"]),
                "gimbal": dict(self._state["gimbal"]) if self._state["gimbal"] else None,
                "battery": dict(self._state["battery"]) if self._state["battery"] else None,
                "sensors": {
                    **self._state["sensors"],
                    "items": [dict(item) for item in self._state["sensors"]["items"]],
                } if self._state["sensors"] else None,
            }
            result["gimbal_error"] = self._state.get("gimbal_error")
            result["battery_error"] = self._state.get("battery_error")
            result["sensors_error"] = self._state.get("sensors_error")
        now = time.time()
        collections = [
            result["motors"],
            result["joints"],
            result["modes"],
            {"connection": result["connection"]},
        ]
        if result["gimbal"] is not None:
            collections.append({"gimbal": result["gimbal"]})
        if result["battery"] is not None:
            collections.append({"battery": result["battery"]})
        if result["sensors"] is not None:
            collections.append({"sensors": result["sensors"]})
        for collection in collections:
            for item in collection.values():
                if not item.get("received_at"):
                    continue
                item["age_seconds"] = max(
                    0, round(now - datetime.fromisoformat(item["received_at"]).timestamp(), 2)
                )
        return result
