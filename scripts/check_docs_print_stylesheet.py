#!/usr/bin/env python3
"""Smoke-check the docs print stylesheet hook."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STYLE_SOURCE = ROOT / "site" / "src" / "assets" / "css" / "style.css"
PRINT_STYLE_SOURCE = ROOT / "site" / "src" / "assets" / "css" / "docs-print.css"
SITE_DIR = ROOT / "site" / "_site"
STYLE_OUTPUT = SITE_DIR / "assets" / "css" / "style.css"
PRINT_STYLE_OUTPUT = SITE_DIR / "assets" / "css" / "docs-print.css"
PRINT_IMPORT = '@import url("./docs-print.css");'


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
    print_source = check_file(PRINT_STYLE_SOURCE, failures)
    style_output = check_file(STYLE_OUTPUT, failures)
    print_output = check_file(PRINT_STYLE_OUTPUT, failures)

    if style_source and not style_source.startswith(PRINT_IMPORT + "\n"):
        failures.append(f"global stylesheet must start with {PRINT_IMPORT!r}")
    if style_output and not style_output.startswith(PRINT_IMPORT + "\n"):
        failures.append(f"built global stylesheet must keep {PRINT_IMPORT!r}")
    if print_source and print_output and print_source != print_output:
        failures.append("built print stylesheet differs from source asset")

    print_surface = compact(print_source)
    for needle in (
        "@media print",
        "background: #ffffff !important;",
        "color: #111111 !important;",
        ".page-content",
    ):
        if needle not in print_surface:
            failures.append(f"print stylesheet missing docs print scaffold: {needle}")

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail DOCS_PRINT_STYLESHEET {failure}")
        return 1

    print("fkst-website dept=site tag=ok DOCS_PRINT_STYLESHEET")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
