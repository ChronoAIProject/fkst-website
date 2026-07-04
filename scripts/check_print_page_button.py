#!/usr/bin/env python3
"""Smoke-check rendered print page controls and print stylesheet rules."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
MANIFEST = ROOT / "site" / "probe-manifest"
STYLE_OUTPUT = SITE_DIR / "assets" / "css" / "style.css"


class PrintPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.html_lang = ""
        self.button_count = 0
        self.script_count = 0
        self.control_count = 0
        self.button_labels: list[str] = []
        self.aria_labels: list[str] = []
        self.button_types: list[str] = []
        self.disabled_buttons = 0
        self._in_button = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "html":
            self.html_lang = attr.get("lang", "")
        if tag == "div" and "data-print-page-control" in attr:
            self.control_count += 1
        if tag == "button" and "data-print-page-button" in attr:
            self.button_count += 1
            self._in_button = True
            self.aria_labels.append(attr.get("aria-label", ""))
            self.button_types.append(attr.get("type", ""))
            if "disabled" in attr:
                self.disabled_buttons += 1
        if tag == "script" and "data-print-page-script" in attr:
            self.script_count += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "button":
            self._in_button = False

    def handle_data(self, data: str) -> None:
        if self._in_button:
            text = data.strip()
            if text:
                self.button_labels.append(text)


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


def check_page(route: str, failures: list[str]) -> None:
    path = output_path(route)
    if not path.is_file():
        failures.append(f"{route}: missing built file {path}")
        return

    html = path.read_text(encoding="utf-8")
    parser = PrintPageParser()
    parser.feed(html)

    expected_label = "打印页面" if parser.html_lang == "zh-Hans" else "Print"
    expected_aria = "打印此页面" if parser.html_lang == "zh-Hans" else "Print this page"

    if parser.control_count != 1:
        failures.append(f"{route}: expected 1 print control wrapper, found {parser.control_count}")
    if parser.button_count != 1:
        failures.append(f"{route}: expected 1 print button, found {parser.button_count}")
    if parser.script_count != 1:
        failures.append(f"{route}: expected 1 print activation script, found {parser.script_count}")
    if parser.button_labels != [expected_label]:
        failures.append(f"{route}: expected visible label {expected_label!r}, found {parser.button_labels!r}")
    if parser.aria_labels != [expected_aria]:
        failures.append(f"{route}: expected aria-label {expected_aria!r}, found {parser.aria_labels!r}")
    if parser.button_types != ["button"]:
        failures.append(f"{route}: print control must be a type=button, found {parser.button_types!r}")
    if parser.disabled_buttons != 1:
        failures.append(f"{route}: built print button must start disabled until client activation")

    page = compact(html)
    for needle in (
        "window.fkstPrintPage",
        "openPrintView",
        "window.print()",
        "button.disabled = false",
        'addEventListener("click"',
        'addEventListener("beforeprint"',
        'addEventListener("afterprint"',
        'matchMedia("print")',
    ):
        if needle not in page:
            failures.append(f"{route}: print script missing activation contract: {needle}")


def check_stylesheet(failures: list[str]) -> None:
    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
        return

    style = compact(STYLE_OUTPUT.read_text(encoding="utf-8"))
    for needle in (
        "@media print",
        ".site-header, .top-nav, .header-actions, .language-switch, .theme-toggle-control, .print-page-control, .site-footer, .article-scroll-progress, .docs-sidebar, .docs-sidebar-toggle, .back-to-top-button, .code-block-copy-button, .code-block-copy-status, .keyboard-shortcut-overlay, .keyboard-shortcut-panel, .keyboard-shortcut-close, .heading-anchor-link, .external-link-marker, .repo-actions { display: none !important;",
        "main, .hero, .features, .page-header, .article-header, .article-shell, .page-content { margin: 0; max-width: none; padding: 0; width: 100%;",
        "background: #ffffff !important;",
        ".page-header a[href]:not([href^=\"#\"]):not([href=\"\"])::after, .page-content a[href]:not([href^=\"#\"]):not([href=\"\"])::after { content: \" (\" attr(href) \")\";",
        "break-inside: avoid;",
        "page-break-inside: avoid;",
        ".code-block-copy pre, pre { background: #ffffff !important;",
        "white-space: pre-wrap;",
        ".print-page-button:focus-visible",
    ):
        if needle not in style:
            failures.append(f"stylesheet missing print-page contract: {needle}")


def main() -> int:
    failures: list[str] = []
    routes = manifest_paths()
    for route in routes:
        check_page(route, failures)
    check_stylesheet(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail PRINT_PAGE_BUTTON {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok PRINT_PAGE_BUTTON pages={len(routes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
