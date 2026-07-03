#!/usr/bin/env python3
"""Smoke-check the built back-to-top scaffold."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
MANIFEST = ROOT / "site" / "probe-manifest"


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


def main() -> int:
    failures: list[str] = []
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
