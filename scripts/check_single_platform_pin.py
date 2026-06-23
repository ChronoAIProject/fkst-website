#!/usr/bin/env python3
"""Check that fkst-packages has exactly one source coordinate."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tomllib
from pathlib import Path


SOURCE_ID = "fkst-packages-platform"
FKST_PACKAGES_GIT = "https://github.com/ChronoAIProject/fkst-packages.git"
SHA_RE = re.compile(r"[0-9a-f]{40}")


def fail(message: str) -> None:
    raise SystemExit(f"error: {message}")


def platform_rev(root: Path) -> str:
    lock_path = root / "fkst.lock"
    try:
        data = tomllib.loads(lock_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing fkst lock file: {lock_path}")
    except tomllib.TOMLDecodeError as exc:
        fail(f"invalid fkst lock file {lock_path}: {exc}")

    sources = data.get("external_source")
    if not isinstance(sources, list):
        fail("fkst.lock has no external_source entries")

    matches = [
        source
        for source in sources
        if isinstance(source, dict) and source.get("id") == SOURCE_ID
    ]
    if len(matches) != 1:
        fail(f"fkst.lock must contain exactly one external_source with id {SOURCE_ID!r}")

    resolved = matches[0].get("resolved")
    if not isinstance(resolved, dict):
        fail(f"fkst.lock external_source(id={SOURCE_ID}) lacks resolved table")

    rev = resolved.get("rev")
    if not isinstance(rev, str) or not SHA_RE.fullmatch(rev):
        fail(f"fkst.lock external_source(id={SOURCE_ID}).resolved.rev must be a full git SHA")
    return rev


def check_no_legacy_ref_files(root: Path) -> None:
    legacy_pin = root / ".fkst-packages-ref"
    if legacy_pin.exists():
        fail(f"legacy fkst-packages pin still exists: {legacy_pin}")

    for path in sorted(path for path in root.iterdir() if path.name.endswith("-ref")):
        if path.name == ".fkst-substrate-ref":
            continue
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            fail(f"could not read top-level ref file {path}: {exc}")
        if "fkst-packages" in path.name or "fkst-packages" in text or FKST_PACKAGES_GIT in text:
            fail(f"top-level ref file pins fkst-packages outside fkst.lock: {path}")


def git_head(checkout: Path) -> str:
    if not (checkout / ".git").exists():
        fail(f"fkst-packages checkout is missing or not a git checkout: {checkout}")
    try:
        result = subprocess.run(
            ["git", "-C", str(checkout), "rev-parse", "HEAD"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError:
        fail("git is not available")
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip()
        detail = f": {stderr}" if stderr else ""
        fail(f"could not read fkst-packages checkout HEAD at {checkout}{detail}")
    head = result.stdout.strip()
    if not SHA_RE.fullmatch(head):
        fail(f"fkst-packages checkout HEAD is not a full git SHA: {head!r}")
    return head


def check_checkout_matches_lock(root: Path, checkout: Path) -> None:
    rev = platform_rev(root)
    head = git_head(checkout)
    if head != rev:
        fail(
            "fkst-packages checkout HEAD does not match "
            f"fkst.lock external_source(id={SOURCE_ID}).resolved.rev: {head} != {rev}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".", help="fkst-website project root")
    parser.add_argument(
        "--checkout",
        default=".fkst/run/fkst-packages-conformance",
        help="fkst-packages checkout path, relative to project root unless absolute",
    )
    parser.add_argument(
        "--print-rev",
        action="store_true",
        help="print fkst.lock external_source(id=fkst-packages-platform).resolved.rev only",
    )
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    if args.print_rev:
        print(platform_rev(root))
        return 0

    checkout = Path(args.checkout)
    if not checkout.is_absolute():
        checkout = root / checkout

    check_no_legacy_ref_files(root)
    check_checkout_matches_lock(root, checkout)
    print("OK: fkst-packages platform pin is sourced only from fkst.lock")
    return 0


if __name__ == "__main__":
    sys.exit(main())
