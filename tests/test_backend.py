import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import server
from adapters.qa_cli import AdapterError, QaCliAdapter
from adapters.ros_diagnostics import RosDiagnosticsAdapter
from adapters.system_metrics import SystemMetricsAdapter


class QaCliTests(unittest.TestCase):
    def test_info_parses_installed_utility_output(self):
        output = "VERSION      : 1.2.3\nMODEL        : mk19m\nMAC ETH0     : 00:11:22:33:44:55\n"
        with patch.object(QaCliAdapter, "_run", return_value=output):
            result = QaCliAdapter().info()
        self.assertEqual(result["source"], "turret-info")
        self.assertEqual(result["fields"]["MODEL"], "mk19m")
        self.assertEqual(result["fields"]["MAC ETH0"], "00:11:22:33:44:55")

    def test_logs_use_fixed_read_only_command_arguments(self):
        with patch("adapters.qa_cli.shutil.which", return_value="/usr/local/bin/turret-logs"), \
             patch("adapters.qa_cli.subprocess.run") as run:
            run.return_value.stdout = "recent log\n"
            run.return_value.stderr = ""
            run.return_value.returncode = 0
            result = QaCliAdapter().logs()
        self.assertEqual(result["text"], "recent log\n")
        self.assertEqual(run.call_args.args[0], [
            "/usr/local/bin/turret-logs", "--since", "1 hour ago",
            "-n", "100", "--no-pager"
        ])
        self.assertIn("fetched_at", result)

    def test_logs_reject_unsupported_time_ranges(self):
        with self.assertRaisesRegex(AdapterError, "Unsupported log time range"):
            QaCliAdapter(mock=True).logs("arbitrary shell input")

    def test_mock_logs_are_stable_and_cover_main_application_startup(self):
        adapter = QaCliAdapter(mock=True)
        startup = adapter.logs("startup")["text"]
        short_range = adapter.logs("15m")["text"]
        one_hour = adapter.logs("1h")["text"]

        self.assertIn("Application startup complete", startup)
        self.assertIn("[ERROR]", startup)
        self.assertIn("[WARN]", startup)
        self.assertIn("[INFO]", startup)
        self.assertNotIn("Application startup complete", short_range)
        self.assertIn("Diagnostics snapshot published", short_range)
        self.assertEqual(
            [line for line in one_hour.splitlines() if line in short_range],
            short_range.splitlines(),
        )

    def test_logs_from_startup_query_systemd_active_enter_time(self):
        with patch.object(
            QaCliAdapter,
            "_run",
            side_effect=["Sun 2026-10-25 12:00:00 CEST", "startup log\n"],
        ) as run:
            result = QaCliAdapter().logs("startup")

        self.assertEqual(result["text"], "startup log\n")
        self.assertEqual(run.call_args_list[0].args[0], "systemctl")
        self.assertEqual(run.call_args_list[1].args, (
            "turret-logs",
            "--since",
            "Sun 2026-10-25 12:00:00 CEST",
            "--no-pager",
        ))

    def test_missing_cli_is_reported(self):
        with patch("adapters.qa_cli.shutil.which", return_value=None):
            with self.assertRaisesRegex(AdapterError, "turret-info is not installed"):
                QaCliAdapter().info()

    def test_mock_mode_identifies_synthetic_source(self):
        self.assertEqual(QaCliAdapter(mock=True).info()["source"], "mock")


class RosDiagnosticsTests(unittest.TestCase):
    def test_missing_uart_typesupport_does_not_stop_other_ros_diagnostics(self):
        adapter = RosDiagnosticsAdapter()
        ros_ok = {"value": False}
        subscriptions = []

        class Node:
            def __init__(self, _name):
                pass

            def create_subscription(self, message_type, topic, _callback, _qos):
                subscriptions.append((message_type, topic))

            def destroy_node(self):
                pass

        rclpy = ModuleType("rclpy")
        rclpy.ok = lambda: ros_ok["value"]
        rclpy.init = lambda args: ros_ok.update(value=True)
        rclpy.shutdown = lambda: ros_ok.update(value=False)

        def spin_once(_node, timeout_sec):
            self.assertEqual(timeout_sec, 0.1)
            adapter._stop.set()

        rclpy.spin_once = spin_once
        node_module = ModuleType("rclpy.node")
        node_module.Node = Node
        qos_module = ModuleType("rclpy.qos")
        qos_module.DurabilityPolicy = SimpleNamespace(TRANSIENT_LOCAL=1)
        qos_module.ReliabilityPolicy = SimpleNamespace(RELIABLE=1)
        qos_module.QoSProfile = lambda **kwargs: kwargs

        def message_package(package, names):
            parent = ModuleType(package)
            parent.__path__ = []
            messages = ModuleType(f"{package}.msg")
            for name in names:
                setattr(messages, name, type(name, (), {}))
            return parent, messages

        sensor_package, sensor_messages = message_package("sensor_msgs", ["JointState"])
        std_package, std_messages = message_package("std_msgs", ["Bool"])
        turret_package, turret_messages = message_package(
            "rob_turret_msgs", ["CANOpenMotorState", "WeaponState", "GimbalState"]
        )
        comm_package, comm_messages = message_package("rob_comm_msgs", [])

        def missing_uart_typesupport(name):
            if name == "UARTTelemetry":
                raise RuntimeError(
                    "Could not import 'rosidl_typesupport_c' for package 'rob_comm_msgs'"
                )
            raise AttributeError(name)

        comm_messages.__getattr__ = missing_uart_typesupport
        telem_package, telem_messages = message_package("rob_telem_msgs", ["SensorHealthReport"])
        modules = {
            "rclpy": rclpy,
            "rclpy.node": node_module,
            "rclpy.qos": qos_module,
            "sensor_msgs": sensor_package,
            "sensor_msgs.msg": sensor_messages,
            "std_msgs": std_package,
            "std_msgs.msg": std_messages,
            "rob_turret_msgs": turret_package,
            "rob_turret_msgs.msg": turret_messages,
            "rob_comm_msgs": comm_package,
            "rob_comm_msgs.msg": comm_messages,
            "rob_telem_msgs": telem_package,
            "rob_telem_msgs.msg": telem_messages,
        }

        with patch.dict("sys.modules", modules):
            adapter._spin()

        result = adapter.snapshot()
        self.assertTrue(result["available"])
        self.assertIsNone(result["error"])
        self.assertIn("rosidl_typesupport_c", result["battery_error"])
        self.assertIn("/joint_states", [topic for _, topic in subscriptions])
        self.assertNotIn("/uart_telemetry", [topic for _, topic in subscriptions])

    def test_stop_waits_for_ros_thread_without_shutting_down_context_concurrently(self):
        adapter = RosDiagnosticsAdapter()
        calls = []

        class Thread:
            def join(self, timeout):
                calls.append(("join", timeout))

            def is_alive(self):
                return False

        class Rclpy:
            @staticmethod
            def ok():
                return True

            @staticmethod
            def shutdown():
                self.fail("shutdown must be performed by the ROS thread")

        adapter._thread = Thread()
        adapter._rclpy = Rclpy()

        adapter.stop()

        self.assertTrue(adapter._stop.is_set())
        self.assertEqual(calls, [("join", 2)])

    def test_motor_and_joint_samples_are_exposed(self):
        adapter = RosDiagnosticsAdapter()

        class Telemetry:
            position = 240
            current = 35
            rpm = 8
            voltage = 24
            temperature = 31

        class Diagnostics:
            alarm_code = 0
            status_word = 4660
            state = 3
            operational = True
            motor_fault_alarm = False
            battery_power_down_alarm = False

        class MotorMessage:
            telemetry = Telemetry()
            diagnostics = Diagnostics()

        class JointMessage:
            name = ["turret_yaw_joint"]
            position = [0.5]
            velocity = [0.1]

        adapter._motor_callback("/x_axis/state", MotorMessage())
        adapter._joint_callback(JointMessage())
        result = adapter.snapshot()
        self.assertEqual(result["motors"]["/x_axis/state"]["current"], 0.035)
        self.assertEqual(result["motors"]["/x_axis/state"]["voltage"], 24)
        self.assertEqual(result["motors"]["/x_axis/state"]["temperature"], 31)
        self.assertEqual(result["motors"]["/x_axis/state"]["state"], 3)
        self.assertEqual(result["motors"]["/x_axis/state"]["drive_status"], "READY")
        self.assertEqual(result["joints"]["turret_yaw_joint"]["position"], 0.5)
        self.assertLessEqual(result["joints"]["turret_yaw_joint"]["age_seconds"], 1)

    def test_battery_voltage_and_sensor_health_are_normalized(self):
        adapter = RosDiagnosticsAdapter()
        adapter._battery_callback(SimpleNamespace(
            battery_voltage=2450,
            battery_percent=72.0,
            is_live=True,
        ))
        adapter._sensor_health_callback(SimpleNamespace(
            aggregated_state=3,
            sensor_states=[
                SimpleNamespace(name="base_imu", state=2),
                SimpleNamespace(name="rangefinder", state=4),
            ],
        ))

        result = adapter.snapshot()
        self.assertEqual(result["battery"]["voltage_v"], 24.5)
        self.assertEqual(result["battery"]["charge_percent"], 72.0)
        self.assertTrue(result["battery"]["is_live"])
        self.assertEqual(result["sensors"]["aggregated_state"], "DEGRADED")
        self.assertEqual(result["sensors"]["items"][1]["state"], "FAILED")

    def test_missing_ros_is_explicitly_unavailable(self):
        adapter = RosDiagnosticsAdapter()
        adapter._state.update({"available": False, "error": "rclpy unavailable"})
        self.assertEqual(adapter.snapshot()["error"], "rclpy unavailable")

    def test_mock_samples_remain_fresh(self):
        adapter = RosDiagnosticsAdapter(mock=True)
        adapter.start()
        first = adapter.snapshot()["motors"]["/x_axis/state"]["received_at"]
        second = adapter.snapshot()["motors"]["/x_axis/state"]["received_at"]
        self.assertGreaterEqual(second, first)

    def test_mock_telemetry_changes_between_snapshots(self):
        adapter = RosDiagnosticsAdapter(mock=True)
        adapter.start()
        first = adapter.snapshot()
        with patch("adapters.ros_diagnostics.random.uniform", return_value=0.1):
            second = adapter.snapshot()
        self.assertNotEqual(
            first["motors"]["/x_axis/state"]["current"],
            second["motors"]["/x_axis/state"]["current"],
        )
        self.assertNotEqual(
            first["joints"]["turret_yaw_joint"]["position"],
            second["joints"]["turret_yaw_joint"]["position"],
        )
        self.assertNotEqual(
            first["motors"]["/x_axis/state"]["voltage"],
            second["motors"]["/x_axis/state"]["voltage"],
        )
        self.assertNotEqual(
            first["motors"]["/x_axis/state"]["temperature"],
            second["motors"]["/x_axis/state"]["temperature"],
        )
        self.assertNotEqual(
            first["battery"]["charge_percent"],
            second["battery"]["charge_percent"],
        )

    def test_connection_weapon_and_gimbal_states_are_exposed(self):
        adapter = RosDiagnosticsAdapter()
        adapter._connection_callback(SimpleNamespace(data=True))
        adapter._weapon_callback(SimpleNamespace(
            mode=3,
            operation_type=1,
            operation_state=2,
            message="recharging paused",
        ))
        adapter._gimbal_callback(SimpleNamespace(
            mode=5,
            operation_type=1,
            operation_state=1,
            message="Homing",
        ))

        result = adapter.snapshot()
        self.assertTrue(result["connection"]["connected"])
        self.assertEqual(result["modes"]["weapon"]["mode"], "ARMED")
        self.assertEqual(result["modes"]["weapon"]["operation_type"], "RECHARGING")
        self.assertEqual(result["gimbal"]["mode"], "PROCEDURE")
        self.assertEqual(result["gimbal"]["operation_state"], "RUNNING")


class HttpApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from auth import AuthManager, password_record
        cls.auth_temp = tempfile.TemporaryDirectory()
        auth_file = Path(cls.auth_temp.name) / "auth.json"
        auth_file.write_text(json.dumps(password_record("test-password")), encoding="utf-8")
        cls.original_auth = server.Handler.auth
        server.Handler.auth = AuthManager(auth_file)
        cls.auth_token, _ = server.Handler.auth.login("test-password", "fixture")
        cls.original_port = server.PORT
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        server.PORT = cls.httpd.server_address[1]
        server.Handler.qa = QaCliAdapter(mock=True)
        server.Handler.ros = RosDiagnosticsAdapter(mock=True)
        server.Handler.system = SystemMetricsAdapter(mock=True)
        server.Handler.ros.start()
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{server.PORT}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)
        server.PORT = cls.original_port
        server.Handler.auth = cls.original_auth
        cls.auth_temp.cleanup()

    def auth_urlopen(self, request):
        from urllib.request import urlopen as actual_urlopen
        if isinstance(request, str):
            request = Request(request)
        request.add_unredirected_header("Cookie", "turret_web_session=" + self.auth_token)
        return actual_urlopen(request)

    def test_read_only_info_and_diagnostics_endpoints(self):
        with self.auth_urlopen(f"{self.base}/api/info") as response:
            info = json.loads(response.read())
        with self.auth_urlopen(f"{self.base}/api/diagnostics") as response:
            diagnostics = json.loads(response.read())
        self.assertEqual(info["fields"]["MODEL"], "mock_turret")
        self.assertTrue(diagnostics["ros"]["available"])
        self.assertTrue(diagnostics["ros"]["connection"]["connected"])
        self.assertEqual(diagnostics["ros"]["gimbal"]["mode"], "MANUAL")
        self.assertIn("cpu_percent", diagnostics["system"])
        self.assertEqual(info["host"]["os_name"], "Ubuntu (mock)")
        self.assertIsNone(info["web_ui"]["build_date"])

    def test_lan_host_is_allowed_only_when_configured(self):
        url = f"{self.base}/api/health"
        request = Request(url, headers={"Host": f"192.168.88.56:{server.PORT}"})
        with self.assertRaises(HTTPError) as raised:
            self.auth_urlopen(request)
        self.assertEqual(raised.exception.code, 403)

        with patch.dict("os.environ", {"TURRET_WEB_ALLOWED_HOSTS": "192.168.88.56"}):
            with self.auth_urlopen(request) as response:
                self.assertEqual(response.status, 200)
                self.assertTrue(json.loads(response.read())["ok"])
            self.assertIn(
                f"http://192.168.88.56:{server.PORT}",
                server.allowed_origins(),
            )

    def test_web_ui_build_date_is_loaded_from_packaged_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "build-info.json").write_text(
                '{"build_date":"2026-10-25"}', encoding="utf-8"
            )
            with patch.object(server, "__file__", str(root / "server.py")):
                self.assertEqual(
                    server.web_ui_build_info(),
                    {"build_date": "2026-10-25"},
                )

    def test_logs_endpoint_accepts_allowlisted_time_range(self):
        with patch.object(server.Handler.qa, "logs", wraps=server.Handler.qa.logs) as logs:
            with self.auth_urlopen(f"{self.base}/api/logs?range=6h") as response:
                result = json.loads(response.read())
        self.assertEqual(result["source"], "mock")
        logs.assert_called_once_with("6h")

    def test_logs_endpoint_rejects_unsupported_time_range(self):
        with self.assertRaises(HTTPError) as raised:
            self.auth_urlopen(f"{self.base}/api/logs?range=unexpected")
        self.assertEqual(raised.exception.code, 400)

    def test_service_actions_run_after_valid_origin(self):
        for action in ("start", "stop", "restart"):
            request = Request(
                f"{self.base}/api/{action}",
                method="POST",
                data=b"{}",
                headers={"Origin": "http://attacker.example"},
            )
            with self.subTest(action=action), self.assertRaises(HTTPError) as raised:
                self.auth_urlopen(request)
            self.assertEqual(raised.exception.code, 403)

    def test_service_actions_use_only_fixed_units_and_commands(self):
        with patch.object(server.subprocess, "run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = ""
            run.return_value.stderr = ""
            for action in ("start", "stop", "restart"):
                server.service_action(action)
                self.assertEqual(run.call_args.args[0], [
                    "/usr/bin/sudo", "-n", "/usr/bin/systemctl", action, "turret.service"
                ])
        with self.assertRaises(ValueError):
            server.service_action("enable")

    def test_service_action_failure_is_reported(self):
        with patch.object(server.subprocess, "run") as run:
            run.return_value.returncode = 1
            run.return_value.stdout = ""
            run.return_value.stderr = "Access denied"
            with self.assertRaisesRegex(AdapterError, "Access denied"):
                server.service_action("restart")

    def test_service_actions_require_valid_origin(self):
        with patch.object(server, "service_action") as service_action:
            for action in ("start", "stop", "restart"):
                request = Request(
                    f"{self.base}/api/{action}",
                    method="POST",
                    data=b"{}",
                    headers={"Origin": self.base},
                )
                with self.auth_urlopen(request) as response:
                    result = json.loads(response.read())
                self.assertEqual(result, {"ok": True, "action": action})
        self.assertEqual(service_action.call_count, 3)

    def test_mock_mode_cannot_control_host_service(self):
        with patch.object(server, "MOCK_MODE", True), patch.object(server, "service_action") as action:
            request = Request(
                f"{self.base}/api/restart",
                method="POST",
                data=b"{}",
                headers={"Origin": self.base},
            )
            with self.assertRaises(HTTPError) as raised:
                self.auth_urlopen(request)
        self.assertEqual(raised.exception.code, 403)
        action.assert_not_called()

    def test_unknown_service_actions_do_not_exist(self):
        request = Request(f"{self.base}/api/enable", method="POST", data=b"{}", headers={"Origin": self.base})
        with self.assertRaises(HTTPError) as raised:
            self.auth_urlopen(request)
        self.assertEqual(raised.exception.code, 404)

    def test_diagnostic_export_is_not_available(self):
        with self.assertRaises(HTTPError) as raised:
            self.auth_urlopen(f"{self.base}/api/diagnostics/export")
        self.assertEqual(raised.exception.code, 404)

    def test_unrecognized_host_is_rejected(self):
        request = Request(f"{self.base}/api/health", headers={"Host": "attacker.example"})
        with self.assertRaises(HTTPError) as raised:
            self.auth_urlopen(request)
        self.assertEqual(raised.exception.code, 403)


class SystemMetricsTests(unittest.TestCase):
    def test_mock_metrics_include_chart_and_overview_values(self):
        adapter = SystemMetricsAdapter(mock=True)
        result = adapter.snapshot()
        self.assertGreaterEqual(result["cpu_percent"], 0)
        self.assertGreater(result["memory_total_bytes"], 0)
        self.assertGreater(result["disk_total_bytes"], 0)
        self.assertGreater(result["uptime_seconds"], 0)
        self.assertEqual(result["errors"], {})
        identity = adapter.identity()
        self.assertEqual(identity["network_interfaces"][0]["name"], "eth0")
        self.assertEqual(identity["network_interfaces"][0]["ipv4_address"], "192.168.1.42")


class AuthenticationTests(unittest.TestCase):
    def test_password_hash_and_verification(self):
        from auth import password_record, verify_password
        record = password_record("unique-example-password")
        self.assertNotIn("unique-example-password", json.dumps(record))
        self.assertTrue(verify_password("unique-example-password", record))
        self.assertFalse(verify_password("incorrect", record))

    def test_sessions_expire_and_logout(self):
        from auth import AuthManager, password_record, session_cookie
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "auth.json"
            file.write_text(json.dumps(password_record("passphrase")), encoding="utf-8")
            manager = AuthManager(file)
            token, error = manager.login("passphrase", "test-client")
            self.assertIsNone(error)
            cookie = session_cookie(token)
            self.assertTrue(manager.authenticated(cookie))
            manager.logout(cookie)
            self.assertFalse(manager.authenticated(cookie))

    def test_rate_limit_rejects_repeated_failures(self):
        from auth import AuthManager, password_record
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "auth.json"
            file.write_text(json.dumps(password_record("correct")), encoding="utf-8")
            manager = AuthManager(file)
            for _ in range(5):
                self.assertEqual(manager.login("bad", "test-client")[0], None)
            self.assertEqual(manager.login("correct", "test-client")[1],
                             "Too many attempts; retry later")

    def test_http_authentication_flow(self):
        from auth import AuthManager, password_record
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "auth.json"
            file.write_text(json.dumps(password_record("test-pass")), encoding="utf-8")
            manager = AuthManager(file)
            with patch.object(server.Handler, "auth", manager):
                httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
                port = httpd.server_address[1]
                with patch.object(server, "PORT", port):
                    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
                    thread.start()
                    base = f"http://127.0.0.1:{port}"
                    try:
                        with self.assertRaises(HTTPError) as raised:
                            urlopen(base + "/api/diagnostics")
                        self.assertEqual(raised.exception.code, 401)
                        request = Request(base + "/api/auth/login",
                            data=json.dumps({"password": "test-pass"}).encode(),
                            headers={"Origin": base, "Content-Type": "application/json"},
                            method="POST")
                        with urlopen(request) as response:
                            cookie = response.headers["Set-Cookie"].split(";", 1)[0]
                        with urlopen(Request(base + "/api/diagnostics",
                                            headers={"Cookie": cookie})) as response:
                            self.assertEqual(response.status, 200)
                        logout = Request(base + "/api/auth/logout", data=b"{}",
                            method="POST", headers={"Origin": base, "Cookie": cookie})
                        with urlopen(logout) as response:
                            self.assertEqual(response.status, 200)
                        with self.assertRaises(HTTPError) as raised:
                            urlopen(Request(base + "/api/diagnostics",
                                            headers={"Cookie": cookie}))
                        self.assertEqual(raised.exception.code, 401)
                    finally:
                        httpd.shutdown()
                        httpd.server_close()
                        thread.join(timeout=2)

if __name__ == "__main__":
    unittest.main()

