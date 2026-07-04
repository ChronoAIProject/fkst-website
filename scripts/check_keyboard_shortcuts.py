#!/usr/bin/env python3
"""Smoke-check the rendered keyboard shortcut help scaffold."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
MANIFEST = ROOT / "site" / "probe-manifest"
STYLE_OUTPUT = SITE_DIR / "assets" / "css" / "style.css"
TARGET_SHA = "ba1691ec545b2820bc0a2f7a5beb17051b716b01"
AUDIT_PATHS = (
    "site/src",
    "site/lib",
    "site/eleventy.config.js",
    "scripts",
    ".fkst/local-packages",
    ".fkst/local-libraries",
)
AUDIT_PATTERN = (
    r"#85|keyboard[-_ ]?shortcut|shortcut[-_ ]?help|data-keyboard|"
    r"KeyboardShortcut|Keyboard shortcuts"
)
EXPECTED_SHORTCUTS = {
    "open-shortcut-help": ("?", "Open keyboard shortcut help"),
    "focus-primary-navigation": ("g n", "Focus primary navigation"),
    "return-to-top": ("g t", "Return to top"),
}


class KeyboardShortcutParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.dialog_count = 0
        self.panel_count = 0
        self.close_buttons = 0
        self.disabled_close_buttons = 0
        self.title_text: list[str] = []
        self.summary_text: list[str] = []
        self.shortcut_text: dict[str, list[str]] = {}
        self._in_title = False
        self._in_summary = False
        self._current_shortcut: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "dialog" and "data-keyboard-shortcut-overlay" in attr:
            self.dialog_count += 1
            if attr.get("aria-labelledby") != "keyboard-shortcut-overlay-title":
                self.title_text.append("[missing-labelledby]")
            if attr.get("aria-describedby") != "keyboard-shortcut-overlay-summary":
                self.summary_text.append("[missing-describedby]")
        if tag == "section" and "data-keyboard-shortcut-panel" in attr:
            self.panel_count += 1
        if tag == "button" and "data-keyboard-shortcut-close" in attr:
            self.close_buttons += 1
            if "disabled" in attr:
                self.disabled_close_buttons += 1
            if attr.get("aria-label") != "Close keyboard shortcut help":
                self.shortcut_text.setdefault("[close-button]", []).append("[missing-label]")
        if attr.get("id") == "keyboard-shortcut-overlay-title":
            self._in_title = True
        if attr.get("id") == "keyboard-shortcut-overlay-summary":
            self._in_summary = True
        shortcut_id = attr.get("data-keyboard-shortcut")
        if shortcut_id:
            self._current_shortcut = shortcut_id
            self.shortcut_text.setdefault(shortcut_id, [])

    def handle_endtag(self, tag: str) -> None:
        if tag == "h2":
            self._in_title = False
        if tag == "p":
            self._in_summary = False
        if tag == "div" and self._current_shortcut:
            self._current_shortcut = None

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_text.append(data)
        if self._in_summary:
            self.summary_text.append(data)
        if self._current_shortcut:
            self.shortcut_text[self._current_shortcut].append(data)


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


def normalized_text(parts: list[str]) -> str:
    return " ".join("".join(parts).split())


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(ROOT), *args],
        check=False,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def foundation_audit_failures() -> list[str]:
    failures: list[str] = []
    target = git("rev-parse", "--verify", f"{TARGET_SHA}^{{commit}}")
    if target.returncode != 0:
        return [f"missing reviewable target commit {TARGET_SHA} for #85 foundation audit"]

    history = git("log", "--format=%H %s", "--extended-regexp", "--grep", AUDIT_PATTERN, "-i", TARGET_SHA)
    if history.returncode != 0:
        failures.append(f"could not audit target history for #85 foundation: {history.stderr.strip()}")
    elif history.stdout.strip():
        failures.append(f"target history has a possible #85 keyboard shortcut foundation:\n{history.stdout}")

    tree = git(
        "grep",
        "-n",
        "-i",
        "-E",
        AUDIT_PATTERN,
        TARGET_SHA,
        "--",
        *AUDIT_PATHS,
    )
    if tree.returncode == 0:
        failures.append(f"target tree already has keyboard shortcut reuse surface:\n{tree.stdout}")
    elif tree.returncode != 1:
        failures.append(f"could not audit target tree for keyboard shortcut reuse surface: {tree.stderr.strip()}")

    return failures


def main() -> int:
    failures: list[str] = foundation_audit_failures()
    routes = manifest_paths()
    for route in routes:
        path = output_path(route)
        if not path.is_file():
            failures.append(f"{route}: missing built file {path}")
            continue

        parser = KeyboardShortcutParser()
        parser.feed(path.read_text(encoding="utf-8"))
        if parser.dialog_count != 1:
            failures.append(f"{route}: expected 1 keyboard shortcut dialog, found {parser.dialog_count}")
        if parser.panel_count != 1:
            failures.append(f"{route}: expected 1 keyboard shortcut panel, found {parser.panel_count}")
        if parser.close_buttons != 1:
            failures.append(f"{route}: expected 1 shortcut help close button, found {parser.close_buttons}")
        if parser.disabled_close_buttons != 1:
            failures.append(f"{route}: shortcut help close button should remain disabled in the scaffold")
        if normalized_text(parser.title_text) != "Keyboard shortcuts":
            failures.append(f"{route}: missing Keyboard shortcuts title")
        if "reference scaffold" not in normalized_text(parser.summary_text):
            failures.append(f"{route}: missing shortcut scaffold summary")
        for shortcut_id, (keys, label) in EXPECTED_SHORTCUTS.items():
            rendered = normalized_text(parser.shortcut_text.get(shortcut_id, []))
            if keys not in rendered or label not in rendered:
                failures.append(f"{route}: missing shortcut entry {shortcut_id}")

    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
    else:
        style = STYLE_OUTPUT.read_text(encoding="utf-8")
        for needle in (
            ".keyboard-shortcut-overlay",
            ".keyboard-shortcut-panel",
            ".keyboard-shortcut-list",
        ):
            if needle not in style:
                failures.append(f"stylesheet missing keyboard shortcut rule: {needle}")

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail KEYBOARD_SHORTCUTS {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok KEYBOARD_SHORTCUTS pages={len(routes)} shortcuts={len(EXPECTED_SHORTCUTS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
