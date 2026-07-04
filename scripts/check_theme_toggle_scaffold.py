#!/usr/bin/env python3
"""Smoke-check the rendered header theme toggle scaffold."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
MANIFEST = ROOT / "site" / "probe-manifest"
SCRIPT_SOURCE = ROOT / "site" / "src" / "assets" / "js" / "theme.js"
SCRIPT_OUTPUT = SITE_DIR / "assets" / "js" / "theme.js"
STYLE_OUTPUT = SITE_DIR / "assets" / "css" / "style.css"


class ThemeToggleParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.header_depth = 0
        self.controls = 0
        self.buttons: list[dict[str, str]] = []
        self.theme_scripts: list[dict[str, str]] = []

    @property
    def in_header(self) -> bool:
        return self.header_depth > 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {name: value or "" for name, value in attrs}
        if tag == "header" and "site-header" in set((attr.get("class") or "").split()):
            self.header_depth += 1
        if self.in_header and tag == "div" and "data-theme-toggle-control" in attr:
            self.controls += 1
        if self.in_header and tag == "button" and "data-theme-toggle-button" in attr:
            self.buttons.append(attr)
        if tag == "script" and "data-theme-script" in attr:
            self.theme_scripts.append(attr)

    def handle_endtag(self, tag: str) -> None:
        if tag == "header" and self.header_depth:
            self.header_depth -= 1


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


def compact(text: str) -> str:
    return " ".join(text.split())


def check_route(route: str, failures: list[str]) -> None:
    path = output_path(route)
    if not path.is_file():
        failures.append(f"{route}: missing built file {path}")
        return

    parser = ThemeToggleParser()
    parser.feed(path.read_text(encoding="utf-8"))

    if parser.controls != 1:
        failures.append(f"{route}: expected 1 theme toggle control, found {parser.controls}")
    if len(parser.buttons) != 1:
        failures.append(f"{route}: expected 1 theme toggle button, found {len(parser.buttons)}")
    else:
        button = parser.buttons[0]
        expected = {
            "type": "button",
            "role": "switch",
            "aria-label": "Toggle dark theme",
            "aria-checked": "false",
        }
        for key, value in expected.items():
            if button.get(key) != value:
                failures.append(f"{route}: expected {key}={value!r}, found {button.get(key)!r}")
        if "disabled" not in button:
            failures.append(f"{route}: scaffolded theme toggle button must start disabled")

    if len(parser.theme_scripts) != 1:
        failures.append(f"{route}: expected 1 theme scaffold script, found {len(parser.theme_scripts)}")
    else:
        script_src = parser.theme_scripts[0].get("src") or ""
        if not script_src.endswith("/assets/js/theme.js"):
            failures.append(f"{route}: unexpected theme scaffold script src {script_src!r}")
        if "defer" not in parser.theme_scripts[0]:
            failures.append(f"{route}: theme scaffold script must be deferred")


def check_script_asset(failures: list[str]) -> None:
    if not SCRIPT_SOURCE.is_file():
        failures.append(f"missing source theme scaffold script {SCRIPT_SOURCE}")
        return
    if not SCRIPT_OUTPUT.is_file():
        failures.append(f"missing built theme scaffold script {SCRIPT_OUTPUT}")
        return

    source = SCRIPT_SOURCE.read_text(encoding="utf-8")
    output = SCRIPT_OUTPUT.read_text(encoding="utf-8")
    if output != source:
        failures.append("built theme scaffold script differs from source asset")

    for needle in (
        'Object.freeze(["light", "dark"])',
        'const defaultTheme = "light"',
        "readTheme",
        "applyTheme",
        "persistTheme",
        "window.fkstTheme",
    ):
        if needle not in source:
            failures.append(f"source theme scaffold script missing interface contract: {needle}")
    if "localStorage" in source:
        failures.append("theme scaffold script must not implement localStorage persistence yet")


def check_stylesheet(failures: list[str]) -> None:
    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
        return

    style = compact(STYLE_OUTPUT.read_text(encoding="utf-8"))
    for needle in (
        ".theme-toggle-control",
        ".theme-toggle-button",
        ".theme-toggle-track",
        ".theme-toggle-knob",
    ):
        if needle not in style:
            failures.append(f"stylesheet missing theme toggle scaffold rule: {needle}")


def main() -> int:
    failures: list[str] = []
    routes = manifest_paths()
    for route in routes:
        check_route(route, failures)
    check_script_asset(failures)
    check_stylesheet(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail THEME_TOGGLE_SCAFFOLD {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok THEME_TOGGLE_SCAFFOLD pages={len(routes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
