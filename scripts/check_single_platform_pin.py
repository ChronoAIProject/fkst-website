#!/usr/bin/env python3
"""Guard that fkst-packages has exactly one host coordinate."""

from __future__ import annotations

import re
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LOCK_FILE = ROOT / "fkst.lock"
CHECKOUT = ROOT / ".fkst" / "run" / "fkst-packages-platform"
SOURCE_ID = "fkst-packages-platform"
EXCLUDED_REF_FILES = {".fkst-substrate-ref"}
SHA_RE = re.compile(r"[0-9a-f]{40}")


def fail(message: str) -> None:
    print(f"FAIL single-platform-pin {message}", file=sys.stderr)
    raise SystemExit(1)


def lock_rev() -> str:
    try:
        data = tomllib.loads(LOCK_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing lockfile path={LOCK_FILE}")
    except tomllib.TOMLDecodeError as exc:
        fail(f"invalid lockfile path={LOCK_FILE} error={exc}")

    sources = data.get("external_source", [])
    if isinstance(sources, dict):
        sources = [sources]

    for source in sources:
        if source.get("id") != SOURCE_ID:
            continue
        rev = source.get("resolved", {}).get("rev")
        if not isinstance(rev, str) or not SHA_RE.fullmatch(rev):
            fail(f"missing full resolved.rev for source={SOURCE_ID}")
        return rev

    fail(f"missing external_source id={SOURCE_ID}")


def workspace_manifest() -> dict[str, Any]:
    manifest = ROOT / "fkst.workspace.toml"
    try:
        data = tomllib.loads(manifest.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing workspace manifest path={manifest}")
    except tomllib.TOMLDecodeError as exc:
        fail(f"invalid workspace manifest path={manifest} error={exc}")
    if not isinstance(data, dict):
        fail(f"invalid workspace manifest shape path={manifest}")
    return data


def check_no_run_backed_workspace_units() -> None:
    workspace = workspace_manifest().get("workspace")
    if not isinstance(workspace, dict):
        fail("workspace manifest is missing [workspace]")

    offenders: list[str] = []
    for key in ("units", "packages", "libraries"):
        values = workspace.get(key, [])
        if not isinstance(values, list):
            fail(f"workspace.{key} must be a list")
        for value in values:
            if not isinstance(value, str):
                fail(f"workspace.{key} contains non-string value={value!r}")
            if value == ".fkst/run" or value.startswith(".fkst/run/"):
                offenders.append(f"{key}:{value}")

    if offenders:
        fail(
            "workspace manifest must not declare hydrated runtime paths "
            f"offenders={','.join(offenders)}"
        )


def check_no_second_ref_pin(expected_rev: str) -> None:
    offenders: list[str] = []
    for path in ROOT.iterdir():
        if not path.is_file() or not path.name.endswith("-ref"):
            continue
        if path.name in EXCLUDED_REF_FILES:
            continue
        offenders.append(path.name)

    if offenders:
        fail(f"unexpected top-level ref files={','.join(sorted(offenders))}")


def checkout_head() -> str:
    git_dir = CHECKOUT / ".git"
    if not git_dir.exists():
        fail(f"missing hydrated checkout path={CHECKOUT}")

    result = subprocess.run(
        ["git", "-C", str(CHECKOUT), "rev-parse", "HEAD"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        fail(f"cannot read hydrated checkout HEAD path={CHECKOUT} stderr={result.stderr.strip()}")

    head = result.stdout.strip()
    if not SHA_RE.fullmatch(head):
        fail(f"hydrated checkout HEAD is not a full SHA head={head!r}")
    return head


def main() -> int:
    expected_rev = lock_rev()
    check_no_run_backed_workspace_units()
    check_no_second_ref_pin(expected_rev)

    head = checkout_head()
    if head != expected_rev:
        fail(f"checkout_head={head} lock_rev={expected_rev}")

    print(f"PASS single-platform-pin lock_rev={expected_rev} checkout_head={head}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
