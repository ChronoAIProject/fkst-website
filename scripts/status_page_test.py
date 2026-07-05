#!/usr/bin/env python3
"""Acceptance test for the Astro status page board snapshot path."""

from __future__ import annotations

import html
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


class StatusPageTest(unittest.TestCase):
    def test_status_page_renders_board_snapshot_from_disk(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            snapshot_path = Path(tmp) / "fkst.site.board.v1.json"
            snapshot = {
                "issues": [
                    {
                        "labels": [{"name": "from-disk"}, {"name": "ready"}],
                        "number": 987,
                        "state": "OPEN",
                        "title": "Disk backed board row",
                        "updatedAt": "2026-07-06T03:04:05Z",
                        "url": "https://github.example/owner/repo/issues/987",
                    }
                ],
                "prs": [],
                "repo": "owner/repo",
                "schema_version": "fkst.site.board.v1",
            }
            snapshot_path.write_text(
                json.dumps(snapshot, separators=(",", ":")),
                encoding="utf-8",
            )

            env = os.environ.copy()
            env["FKST_SITE_BOARD_SNAPSHOT"] = str(snapshot_path)
            result = subprocess.run(
                ["npm", "run", "build"],
                cwd=SITE,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            self.assertEqual(
                result.returncode,
                0,
                result.stdout + result.stderr,
            )

            status_html = SITE / "_site" / "status" / "index.html"
            self.assertTrue(status_html.exists(), "missing built /status page")
            rendered = status_html.read_text(encoding="utf-8")
            self.assertIn("owner/repo#987", rendered)
            self.assertIn("OPEN", rendered)
            self.assertIn("<td>2</td>", rendered)
            self.assertIn(html.escape("Disk backed board row"), rendered)


if __name__ == "__main__":
    unittest.main()
