#!/usr/bin/env python3
"""Smoke-check the built print page button scaffold."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
MANIFEST = ROOT / "site" / "probe-manifest"
STYLE_PATH = SITE_DIR / "assets" / "css" / "style.css"
TARGET_SHA = "024cbefe9e064daf99e21e28a73f71a9a1bed224"
RECURRENCE_PATHS = (
    "site/src",
    "scripts",
    ".fkst/local-packages",
    ".fkst/local-libraries",
)
RECURRENCE_PATTERN = (
    r"@media[[:space:]]+print|window[.]print|data-print|fkstPrint|"
    r"print(-|_|[[:space:]])?(friendly|page|view|button|toggle|stylesheet)"
)
HEADER_PRINT_PATTERN = re.compile(r"data-print|fkstprint|print", re.IGNORECASE)


class PrintPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_site_header = False
        self.in_print_link = False
        self.in_print_script = False
        self.links: list[dict[str, str | None]] = []
        self.link_text: list[str] = []
        self.script_text: list[str] = []
        self.script_count = 0
        self.active_header_control: tuple[str, dict[str, str | None]] | None = None
        self.active_header_control_text: list[str] = []
        self.header_controls: list[tuple[str, dict[str, str | None], str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        classes = set((attr.get("class") or "").split())
        if tag == "header" and "site-header" in classes:
            self.in_site_header = True
        if self.in_site_header and tag in ("a", "button"):
            self.active_header_control = (tag, attr)
            self.active_header_control_text = []
        if self.in_site_header and tag == "button" and "data-print-page" in attr:
            self.links.append(attr)
            self.in_print_link = True
        if tag == "script" and "data-print-page-script" in attr:
            self.script_count += 1
            self.in_print_script = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "button" and self.in_print_link:
            self.in_print_link = False
        if tag == "script" and self.in_print_script:
            self.in_print_script = False
        if self.active_header_control and tag == self.active_header_control[0]:
            control_tag, control_attr = self.active_header_control
            text = " ".join(" ".join(self.active_header_control_text).split())
            self.header_controls.append((control_tag, control_attr, text))
            self.active_header_control = None
            self.active_header_control_text = []
        if tag == "header" and self.in_site_header:
            self.in_site_header = False

    def handle_data(self, data: str) -> None:
        if self.in_print_link:
            self.link_text.append(data)
        if self.in_print_script:
            self.script_text.append(data)
        if self.active_header_control:
            self.active_header_control_text.append(data)


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


def print_foundation_audit_failures() -> list[str]:
    failures: list[str] = []
    result = git("rev-parse", "--verify", f"{TARGET_SHA}^{{commit}}")
    if result.returncode != 0:
        return [f"target {TARGET_SHA}: missing reviewable commit for print reuse audit"]

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
        failures.append(f"target {TARGET_SHA} already has #75/#86 print reuse surface:\n{grep.stdout}")
    elif grep.returncode != 1:
        failures.append(f"could not audit target tree for #75/#86 print reuse surface: {grep.stderr.strip()}")

    return failures


def check_print_styles() -> list[str]:
    failures: list[str] = []
    if not STYLE_PATH.is_file():
        return [f"missing built stylesheet {STYLE_PATH}"]

    css = STYLE_PATH.read_text(encoding="utf-8")
    required = ("@media print", ".site-header", ".back-to-top-button")
    for token in required:
        if token not in css:
            failures.append(f"stylesheet missing print scaffold token {token}")
    if css.count("@media print") != 1:
        failures.append(f"stylesheet expected 1 print media block, found {css.count('@media print')}")
    return failures


def header_print_controls(parser: PrintPageParser) -> list[tuple[str, dict[str, str | None], str]]:
    controls: list[tuple[str, dict[str, str | None], str]] = []
    for tag, attr, text in parser.header_controls:
        tokens = [tag, text, *attr.keys(), *((value or "") for value in attr.values())]
        if HEADER_PRINT_PATTERN.search(" ".join(tokens)):
            controls.append((tag, attr, text))
    return controls


def check_route(route: str) -> list[str]:
    failures: list[str] = []
    path = output_path(route)
    if not path.is_file():
        return [f"{route}: missing built file {path}"]

    parser = PrintPageParser()
    parser.feed(path.read_text(encoding="utf-8"))

    print_controls = header_print_controls(parser)
    if len(print_controls) != 1:
        failures.append(f"{route}: expected 1 header print surface, found {len(print_controls)}")

    if len(parser.links) != 1:
        failures.append(f"{route}: expected 1 print page button, found {len(parser.links)}")
        return failures

    link = parser.links[0]
    if link.get("type") != "button":
        failures.append(f"{route}: print page control is not type=button")
    if not link.get("aria-label"):
        failures.append(f"{route}: missing print page accessible label")
    if link.get("data-print-page-target") != "native-print":
        failures.append(f"{route}: print page button target is not native-print")

    label = " ".join(" ".join(parser.link_text).split())
    if not label:
        failures.append(f"{route}: missing visible print page label")

    script = "\n".join(parser.script_text)
    if parser.script_count != 1:
        failures.append(f"{route}: expected 1 print page script, found {parser.script_count}")
    if "openPrintView" not in script or "window.print" not in script:
        failures.append(f"{route}: missing print page handler wiring")

    return failures


def main() -> int:
    failures = print_foundation_audit_failures()
    failures.extend(check_print_styles())
    routes = manifest_paths()
    for route in routes:
        failures.extend(check_route(route))

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail PRINT_PAGE {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok PRINT_PAGE pages={len(routes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
