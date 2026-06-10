#!/usr/bin/env python3
"""Unit tests for the deployed-site probe script."""

from __future__ import annotations

import os
import stat
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / "scripts" / "probe_site.sh"


class ProbeSiteTest(unittest.TestCase):
    def run_probe(self, manifest: str, fake_curl: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            manifest_path = tmp_path / "probe-manifest"
            manifest_path.write_text(manifest, encoding="utf-8")

            bin_dir = tmp_path / "bin"
            bin_dir.mkdir()
            curl_path = bin_dir / "curl"
            curl_path.write_text(fake_curl, encoding="utf-8")
            curl_path.chmod(curl_path.stat().st_mode | stat.S_IXUSR)

            env = os.environ.copy()
            env.update(
                {
                    "PATH": f"{bin_dir}{os.pathsep}{env['PATH']}",
                    "FKST_SITE_PROBE_MANIFEST": str(manifest_path),
                    "FKST_SITE_PROBE_BASE_URL": "https://example.test",
                }
            )
            return subprocess.run(
                [str(PROBE)],
                cwd=ROOT,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

    def test_all_200_logs_ok(self) -> None:
        curl = textwrap.dedent(
            """\
            #!/usr/bin/env bash
            printf '200'
            """
        )
        result = self.run_probe("/\n/zh/\n", curl)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.strip(),
            "fkst-website dept=pages tag=ok PROBE paths=2 results=/:200,/zh/:200",
        )

    def test_partial_failure_logs_fail_and_exits_1(self) -> None:
        curl = textwrap.dedent(
            """\
            #!/usr/bin/env bash
            url="${@: -1}"
            case "$url" in
              */missing.html) printf '404' ;;
              *) printf '200' ;;
            esac
            """
        )
        result = self.run_probe("/\n/missing.html\n", curl)

        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stdout.strip(),
            "fkst-website dept=pages tag=fail PROBE paths=2 failures=1 network_errors=0 results=/:200,/missing.html:404",
        )

    def test_all_network_error_logs_skip(self) -> None:
        curl = textwrap.dedent(
            """\
            #!/usr/bin/env bash
            exit 7
            """
        )
        result = self.run_probe("/\n/zh/\n", curl)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.strip(),
            "fkst-website dept=pages tag=skip PROBE paths=2 reason=all-paths-network-error results=/:error,/zh/:error",
        )


if __name__ == "__main__":
    unittest.main()
