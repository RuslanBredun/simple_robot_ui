import json
import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import server
from adapters.qa_cli import AdapterError, QaCliAdapter
from adapters.ros_diagnostics import RosDiagnosticsAdapter


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
            "/usr/local/bin/turret-logs", "-n", "100", "--no-pager"
        ])
        self.assertIn("fetched_at", result)

    def test_missing_cli_is_reported(self):
        with patch("adapters.qa_cli.shutil.which", return_value=None):
            with self.assertRaisesRegex(AdapterError, "turret-info is not installed"):
                QaCliAdapter().info()

    def test_mock_mode_identifies_synthetic_source(self):
        self.assertEqual(QaCliAdapter(mock=True).info()["source"], "mock")


class RosDiagnosticsTests(unittest.TestCase):
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
        self.assertEqual(result["motors"]["/x_axis/state"]["current"], 35)
        self.assertEqual(result["motors"]["/x_axis/state"]["state"], 3)
        self.assertEqual(result["joints"]["turret_yaw_joint"]["position"], 0.5)
        self.assertLessEqual(result["joints"]["turret_yaw_joint"]["age_seconds"], 1)

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
        cls.original_port = server.PORT
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        server.PORT = cls.httpd.server_address[1]
        server.Handler.qa = QaCliAdapter(mock=True)
        server.Handler.ros = RosDiagnosticsAdapter(mock=True)
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

    def test_read_only_info_and_diagnostics_endpoints(self):
        with urlopen(f"{self.base}/api/info") as response:
            info = json.loads(response.read())
        with urlopen(f"{self.base}/api/diagnostics") as response:
            diagnostics = json.loads(response.read())
        self.assertEqual(info["fields"]["MODEL"], "mock_turret")
        self.assertTrue(diagnostics["ros"]["available"])
        self.assertTrue(diagnostics["ros"]["connection"]["connected"])
        self.assertEqual(diagnostics["ros"]["gimbal"]["mode"], "MANUAL")

    def test_service_actions_run_after_valid_origin(self):
        for action in ("start", "stop", "restart"):
            request = Request(
                f"{self.base}/api/{action}",
                method="POST",
                data=b"{}",
                headers={"Origin": "http://attacker.example"},
            )
            with self.subTest(action=action), self.assertRaises(HTTPError) as raised:
                urlopen(request)
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
                with urlopen(request) as response:
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
                urlopen(request)
        self.assertEqual(raised.exception.code, 403)
        action.assert_not_called()

    def test_unknown_service_actions_do_not_exist(self):
        request = Request(f"{self.base}/api/enable", method="POST", data=b"{}")
        with self.assertRaises(HTTPError) as raised:
            urlopen(request)
        self.assertEqual(raised.exception.code, 404)

    def test_report_is_downloadable_json(self):
        with urlopen(f"{self.base}/api/diagnostics/export") as response:
            report = json.loads(response.read())
            disposition = response.headers["Content-Disposition"]
        self.assertIn("robot-diagnostics-", disposition)
        self.assertIn("logs", report["sections"])
        self.assertIn("ros", report["sections"])

    def test_unrecognized_host_is_rejected(self):
        request = Request(f"{self.base}/api/health", headers={"Host": "attacker.example"})
        with self.assertRaises(HTTPError) as raised:
            urlopen(request)
        self.assertEqual(raised.exception.code, 403)


if __name__ == "__main__":
    unittest.main()
