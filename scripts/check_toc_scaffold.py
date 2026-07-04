#!/usr/bin/env python3
"""Smoke-check the built article table-of-contents scaffold."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
EXPECTED_ENTRY_IDS = {
    "/architecture.html": "company-model",
    "/doctrine.html": "markers",
    "/zh/architecture.html": "company-model",
    "/zh/doctrine.html": "markers",
}


class TocParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_toc = False
        self.current_link: str | None = None
        self.sidebars = 0
        self.labeled_sidebars = 0
        self.links: list[tuple[str, str]] = []
        self.heading_ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "nav" and "data-toc-sidebar" in attr:
            self.in_toc = True
            self.sidebars += 1
            if attr.get("aria-label"):
                self.labeled_sidebars += 1
        if self.in_toc and tag == "a":
            href = attr.get("href")
            if href and href.startswith("#"):
                self.current_link = href[1:]
        if tag in {"h2", "h3"}:
            heading_id = attr.get("id")
            if heading_id:
                self.heading_ids.add(heading_id)

    def handle_endtag(self, tag: str) -> None:
        if self.in_toc and tag == "nav":
            self.in_toc = False
        if self.in_toc and tag == "a":
            self.current_link = None

    def handle_data(self, data: str) -> None:
        if self.in_toc and self.current_link:
            text = " ".join(data.split())
            if text:
                self.links.append((self.current_link, text))


def output_path(route: str) -> Path:
    return SITE_DIR / route.lstrip("/")


def main() -> int:
    failures: list[str] = []
    for route, expected_id in EXPECTED_ENTRY_IDS.items():
        path = output_path(route)
        if not path.is_file():
            failures.append(f"{route}: missing built file {path}")
            continue

        parser = TocParser()
        parser.feed(path.read_text(encoding="utf-8"))
        if parser.sidebars != 1:
            failures.append(f"{route}: expected 1 TOC sidebar, found {parser.sidebars}")
        if parser.labeled_sidebars != 1:
            failures.append(f"{route}: expected 1 labeled TOC navigation landmark")
        if not parser.links:
            failures.append(f"{route}: expected at least one TOC entry")
        if expected_id not in {link_id for link_id, _ in parser.links}:
            failures.append(f"{route}: missing expected TOC entry #{expected_id}")
        for link_id, text in parser.links:
            if link_id not in parser.heading_ids:
                failures.append(f"{route}: TOC entry {text!r} points to missing heading #{link_id}")

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail TOC_SCAFFOLD {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok TOC_SCAFFOLD pages={len(EXPECTED_ENTRY_IDS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
