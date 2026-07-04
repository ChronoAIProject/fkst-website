#!/usr/bin/env python3
"""Smoke-check the docs print stylesheet behavior."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STYLE_SOURCE = ROOT / "site" / "src" / "assets" / "css" / "style.css"
SITE_DIR = ROOT / "site" / "_site"
STYLE_OUTPUT = SITE_DIR / "assets" / "css" / "style.css"


def compact(text: str) -> str:
    return " ".join(text.split())


def check_file(path: Path, failures: list[str]) -> str:
    if not path.is_file():
        failures.append(f"missing file {path}")
        return ""
    return path.read_text(encoding="utf-8")


def main() -> int:
    failures: list[str] = []
    style_source = check_file(STYLE_SOURCE, failures)
    style_output = check_file(STYLE_OUTPUT, failures)

    if style_source and style_output and style_source != style_output:
        failures.append("built stylesheet differs from source asset")

    print_surface = compact(style_output or style_source)
    required_rules = (
        "@media print",
        "@page { margin: 16mm; }",
        "body, .article-shell, .page-header, .page-content { background: #ffffff !important; color: #111111 !important; }",
        ".site-header, .top-nav, .header-actions, .language-switch, .theme-toggle-control, .print-page-control, .site-footer, .article-scroll-progress, .docs-sidebar, .docs-sidebar-toggle, .back-to-top-button, .code-block-copy-button, .code-block-copy-status, .keyboard-shortcut-overlay, .keyboard-shortcut-panel, .keyboard-shortcut-close, .heading-anchor-link, .external-link-marker, .repo-actions { display: none !important; }",
        ".article-shell, .article-shell[data-docs-sidebar-state=\"closed\"] { display: block; gap: 0; grid-template-columns: none; }",
        ".page-header a[href]:not([href^=\"#\"]):not([href=\"\"])::after, .page-content a[href]:not([href^=\"#\"]):not([href=\"\"])::after { content: \" (\" attr(href) \")\";",
        ".page-header a[href^=\"#\"]::after, .page-content a[href^=\"#\"]::after, .heading-anchor-link::after { content: \"\"; }",
        ".code-block-copy pre, pre { background: #ffffff !important; border: 1px solid #c8c8c8;",
        "overflow-wrap: anywhere;",
        "white-space: pre-wrap;",
        "break-inside: avoid;",
        "page-break-inside: avoid;",
    )
    for needle in required_rules:
        if needle not in print_surface:
            failures.append(f"print stylesheet missing docs print behavior: {needle}")

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail DOCS_PRINT_STYLESHEET {failure}")
        return 1

    print("fkst-website dept=site tag=ok DOCS_PRINT_STYLESHEET")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
