#!/usr/bin/env python3
"""Smoke-check the built back-to-top scaffold."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
MANIFEST = ROOT / "site" / "probe-manifest"
FOUNDATION_SHA = "3bfdce3077ae9dafb7f8607e67e698d409b744b3"
TARGET_SHA = "141cc516eefa3adea68006307facb5d532bd9284"
RECURRENCE_PATHS = (
    "site",
    "scripts",
    ".fkst/local-packages",
    ".fkst/local-libraries",
)
RECURRENCE_PATTERN = r"back[-_]?to[-_]?top|backtotop|data-back-to-top"


class BackToTopParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.buttons = 0
        self.labels: list[str] = []
        self.has_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "button" and "data-back-to-top" in attr:
            self.buttons += 1
            label = attr.get("aria-label")
            if label:
                self.labels.append(label)
        if tag == "script" and "data-back-to-top-script" in attr:
            self.has_script = True


def manifest_paths() -> list[str]:
    paths: list[str] = []
    for raw_line in MANIFEST.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if line:
            paths.append(line)
    return paths


def output_path(route: str) -> Path:
    if route.endswith("/"):
        return SITE_DIR / route.lstrip("/") / "index.html"
    return SITE_DIR / route.lstrip("/")


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(ROOT), *args],
        check=False,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def recurrence_audit_failures() -> list[str]:
    failures: list[str] = []
    for sha, label in ((FOUNDATION_SHA, "#68 foundation"), (TARGET_SHA, "target")):
        result = git("rev-parse", "--verify", f"{sha}^{{commit}}")
        if result.returncode != 0:
            failures.append(f"{label}: missing reviewable commit {sha}")

    if failures:
        return failures

    ancestor = git("merge-base", "--is-ancestor", FOUNDATION_SHA, TARGET_SHA)
    if ancestor.returncode == 0:
        failures.append(f"#68 foundation {FOUNDATION_SHA} is already in target {TARGET_SHA}")
    elif ancestor.returncode != 1:
        failures.append(f"could not compare #68 foundation with target: {ancestor.stderr.strip()}")

    grep = git(
        "grep",
        "-n",
        "-i",
        "-E",
        RECURRENCE_PATTERN,
        TARGET_SHA,
        "--",
        *RECURRENCE_PATHS,
    )
    if grep.returncode == 0:
        failures.append(f"target {TARGET_SHA} already has back-to-top reuse surface:\n{grep.stdout}")
    elif grep.returncode != 1:
        failures.append(f"could not audit target tree for back-to-top reuse surface: {grep.stderr.strip()}")

    return failures


def main() -> int:
    failures: list[str] = recurrence_audit_failures()
    for route in manifest_paths():
        path = output_path(route)
        if not path.is_file():
            failures.append(f"{route}: missing built file {path}")
            continue

        parser = BackToTopParser()
        parser.feed(path.read_text(encoding="utf-8"))
        if parser.buttons != 1:
            failures.append(f"{route}: expected 1 back-to-top button, found {parser.buttons}")
        if not parser.labels:
            failures.append(f"{route}: missing accessible back-to-top label")
        if not parser.has_script:
            failures.append(f"{route}: missing back-to-top script stub")

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail BACK_TO_TOP {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok BACK_TO_TOP pages={len(manifest_paths())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
