import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import server


class BackendTests(unittest.TestCase):
    def test_allowed_action(self):
        with patch.object(server.subprocess, "run") as run:
            server.systemctl("restart")
            self.assertEqual(run.call_args.args[0], [
                "/usr/bin/sudo", "-n", "/usr/bin/systemctl", "restart", "turret.service"
            ])

    def test_forbidden_action(self):
        with self.assertRaises(ValueError):
            server.systemctl("enable")

    def test_journal_is_fixed_unit(self):
        with patch.object(server.subprocess, "run") as run:
            server.logs()
            args = run.call_args.args[0]
            self.assertEqual(args[:3], ["/usr/bin/journalctl", "-u", "turret.service"])


if __name__ == "__main__":
    unittest.main()
