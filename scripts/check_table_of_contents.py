#!/usr/bin/env python3
"""Smoke-check rendered article table-of-contents behavior."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
OUTPUT_DIR = SITE_DIR / "_site"
SOURCE_FIXTURE = SITE_DIR / "src" / "__toc_smoke.njk"
OUTPUT_FIXTURE = OUTPUT_DIR / "__toc_smoke" / "index.html"
SCRIPT_OUTPUT = OUTPUT_DIR / "assets" / "js" / "table-of-contents.js"
STYLE_OUTPUT = OUTPUT_DIR / "assets" / "css" / "style.css"

ARTICLE_ROUTES = (
    "architecture.html",
    "doctrine.html",
    "zh/architecture.html",
    "zh/doctrine.html",
)
NON_TOC_ROUTES = (
    "index.html",
    "zh/index.html",
)


class TocParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.heading_ids: set[str] = set()
        self.in_toc = False
        self.in_link = False
        self.list_depth = 0
        self.sidebars = 0
        self.labeled_navs = 0
        self.script_tags = 0
        self.links: list[dict[str, object]] = []
        self.current_link: dict[str, object] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag in {"h2", "h3"}:
            heading_id = attr.get("id")
            if heading_id:
                self.heading_ids.add(heading_id)
        if tag == "nav" and "data-toc-nav" in attr:
            self.in_toc = True
            self.sidebars += 1
            if attr.get("aria-label"):
                self.labeled_navs += 1
        if tag == "script" and "data-toc-script" in attr:
            self.script_tags += 1
        if self.in_toc and tag == "ol":
            self.list_depth += 1
        if self.in_toc and tag == "a":
            self.in_link = True
            self.current_link = {
                "href": attr.get("href", ""),
                "depth": self.list_depth,
                "text": "",
                "aria_current": attr.get("aria-current"),
            }

    def handle_endtag(self, tag: str) -> None:
        if self.in_toc and tag == "a":
            if self.current_link:
                self.links.append(self.current_link)
            self.current_link = None
            self.in_link = False
        if self.in_toc and tag == "ol":
            self.list_depth -= 1
        if self.in_toc and tag == "nav":
            self.in_toc = False

    def handle_data(self, data: str) -> None:
        if self.in_toc and self.in_link and self.current_link is not None:
            text = " ".join(data.split())
            if text:
                self.current_link["text"] = f"{self.current_link['text']} {text}".strip()


def build_fixture() -> subprocess.CompletedProcess[str]:
    SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/article.njk
            permalink: /__toc_smoke/
            lang: en
            title: Table of Contents Smoke | fkst
            description: "Smoke fixture for nested table-of-contents rendering."
            hasTableOfContents: true
            articleTitle: Table of Contents Smoke
            brandHref: /
            nav: []
            languageSwitch: []
            footerText: Smoke fixture
            ---
            <h3 id="orphan-h3">Orphan h3</h3>
            <h2 id="alpha">Alpha</h2>
            <p>Alpha body.</p>
            <h3 id="alpha-child">Alpha child</h3>
            <p>Alpha child body.</p>
            <h2 id="beta">Beta &amp; release</h2>
            <p>Beta body.</p>
            """
        ),
        encoding="utf-8",
    )
    try:
        return subprocess.run(
            ["npm", "run", "build"],
            cwd=SITE_DIR,
            check=False,
            encoding="utf-8",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    finally:
        SOURCE_FIXTURE.unlink(missing_ok=True)


def parse_output(path: Path) -> TocParser:
    parser = TocParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def assert_article(route: str, failures: list[str]) -> None:
    path = OUTPUT_DIR / route
    if not path.is_file():
        failures.append(f"{route}: missing built file {path}")
        return

    parser = parse_output(path)
    if parser.sidebars != 1:
        failures.append(f"{route}: expected 1 TOC sidebar, found {parser.sidebars}")
    if parser.labeled_navs != 1:
        failures.append(f"{route}: expected 1 labeled TOC navigation landmark")
    if parser.script_tags != 1:
        failures.append(f"{route}: expected 1 TOC enhancement script, found {parser.script_tags}")
    if not parser.links:
        failures.append(f"{route}: expected TOC entries")
    for link in parser.links:
        href = str(link["href"])
        if not href.startswith("#"):
            failures.append(f"{route}: TOC link does not target a fragment: {href}")
            continue
        if href[1:] not in parser.heading_ids:
            failures.append(f"{route}: TOC link points to missing heading: {href}")
        if link["aria_current"] is not None:
            failures.append(f"{route}: static TOC link should not pre-set aria-current")


def assert_non_toc(route: str, failures: list[str]) -> None:
    path = OUTPUT_DIR / route
    if not path.is_file():
        failures.append(f"{route}: missing built file {path}")
        return

    parser = parse_output(path)
    if parser.sidebars:
        failures.append(f"{route}: non-opt-in page rendered a TOC sidebar")
    if parser.script_tags:
        failures.append(f"{route}: non-opt-in page rendered the TOC script")


def assert_fixture(failures: list[str]) -> None:
    if not OUTPUT_FIXTURE.is_file():
        failures.append(f"missing nested TOC fixture output {OUTPUT_FIXTURE}")
        return

    parser = parse_output(OUTPUT_FIXTURE)
    links_by_text = {str(link["text"]): link for link in parser.links}
    for text in ("Orphan h3", "Alpha", "Alpha child", "Beta & release"):
        if text not in links_by_text:
            failures.append(f"fixture missing TOC entry: {text}")

    orphan = links_by_text.get("Orphan h3")
    child = links_by_text.get("Alpha child")
    alpha = links_by_text.get("Alpha")
    if orphan and orphan["depth"] != 1:
        failures.append("orphan h3 must remain a deterministic top-level entry")
    if alpha and alpha["depth"] != 1:
        failures.append("h2 entries must render at the top TOC list depth")
    if child and child["depth"] != 2:
        failures.append("h3 entries after h2 must render in a nested TOC list")


def assert_assets(failures: list[str]) -> None:
    if not SCRIPT_OUTPUT.is_file():
        failures.append(f"missing built TOC script asset {SCRIPT_OUTPUT}")
    else:
        script = SCRIPT_OUTPUT.read_text(encoding="utf-8")
        for needle in (
            "[data-toc-nav]",
            "[data-toc-link]",
            'setAttribute("aria-current", "location")',
            'removeAttribute("aria-current")',
            "hashchange",
            "requestAnimationFrame",
        ):
            if needle not in script:
                failures.append(f"TOC script missing enhancement contract: {needle}")

    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
    else:
        style = STYLE_OUTPUT.read_text(encoding="utf-8")
        for needle in (
            ".article-shell",
            ".toc-sidebar",
            "position: sticky",
            ".toc-list-nested",
            '@media (max-width: 900px)',
        ):
            if needle not in style:
                failures.append(f"stylesheet missing TOC rule: {needle}")


def main() -> int:
    failures: list[str] = []
    result = build_fixture()
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="")
        return result.returncode

    for route in ARTICLE_ROUTES:
        assert_article(route, failures)
    for route in NON_TOC_ROUTES:
        assert_non_toc(route, failures)
    assert_fixture(failures)
    assert_assets(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail TABLE_OF_CONTENTS {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok TABLE_OF_CONTENTS pages={len(ARTICLE_ROUTES)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
