#!/usr/bin/env python3
"""Smoke-check rendered docs table-of-contents scaffold."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess
import textwrap
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
SITE_ROOT = ROOT / "site"
SITE_DIR = SITE_ROOT / "_site"
STYLE_OUTPUT = SITE_DIR / "assets" / "css" / "style.css"
NO_TOC_SOURCE_FIXTURE = SITE_ROOT / "src" / "__docs_toc_no_entries.njk"
NESTED_SOURCE_FIXTURE = SITE_ROOT / "src" / "__docs_toc_nested.njk"
NO_TOC_OUTPUT_FIXTURE = SITE_DIR / "__docs_toc_no_entries" / "index.html"
NESTED_OUTPUT_FIXTURE = SITE_DIR / "__docs_toc_nested" / "index.html"
ARTICLE_ROUTES = (
    "/architecture.html",
    "/doctrine.html",
    "/zh/architecture.html",
    "/zh/doctrine.html",
)
NON_ARTICLE_ROUTES = (
    "/",
    "/zh/",
)


class DocsTocParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sidebar_count = 0
        self.sidebar_empty_count = 0
        self.script_count = 0
        self.content_depth = 0
        self.current_heading: dict[str, str] | None = None
        self.heading_anchor_depth = 0
        self.headings: list[dict[str, str]] = []
        self.current_toc_entry: dict[str, str] | None = None
        self.current_toc_link = False
        self.toc_entries: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if "data-docs-sidebar-content" in attr:
            self.content_depth += 1
        elif self.content_depth:
            self.content_depth += 1

        if tag == "aside" and "data-docs-sidebar" in attr:
            self.sidebar_count += 1
            if "data-docs-sidebar-empty" in attr:
                self.sidebar_empty_count += 1
        if tag == "script" and "data-docs-sidebar-script" in attr:
            self.script_count += 1

        if self.content_depth and tag in ("h2", "h3") and attr.get("id"):
            self.current_heading = {"id": attr["id"], "level": str({"h2": 2, "h3": 3}[tag]), "text": ""}
        if self.current_heading is not None and "data-heading-anchor" in attr:
            self.heading_anchor_depth += 1

        if tag == "li" and "data-docs-toc-entry" in attr:
            self.current_toc_entry = {
                "level": attr.get("data-docs-toc-level", ""),
                "depth": attr.get("data-docs-toc-depth", ""),
                "href": "",
                "text": "",
            }
        if self.current_toc_entry is not None and tag == "a" and "data-docs-toc-link" in attr:
            self.current_toc_entry["href"] = attr.get("href", "")
            self.current_toc_link = True

    def handle_endtag(self, tag: str) -> None:
        if self.current_heading is not None and tag == "a" and self.heading_anchor_depth:
            self.heading_anchor_depth -= 1
        if self.current_heading is not None and tag in ("h2", "h3"):
            self.current_heading["text"] = " ".join(self.current_heading["text"].split())
            if self.current_heading["text"]:
                self.headings.append(self.current_heading)
            self.current_heading = None
            self.heading_anchor_depth = 0
        if self.current_toc_entry is not None and tag == "a":
            self.current_toc_link = False
        if self.current_toc_entry is not None and tag == "li":
            self.current_toc_entry["text"] = " ".join(self.current_toc_entry["text"].split())
            self.toc_entries.append(self.current_toc_entry)
            self.current_toc_entry = None

        if self.content_depth:
            self.content_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.current_heading is not None and not self.heading_anchor_depth:
            self.current_heading["text"] += data
        if self.current_toc_entry is not None and self.current_toc_link:
            self.current_toc_entry["text"] += data


def output_path(route: str) -> Path:
    if route.endswith("/"):
        return SITE_DIR / route.lstrip("/") / "index.html"
    return SITE_DIR / route.lstrip("/")


def parse_route(route: str, failures: list[str]) -> DocsTocParser | None:
    path = output_path(route)
    if not path.is_file():
        failures.append(f"{route}: missing built file {path}")
        return None

    parser = DocsTocParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def expected_href(heading_id: str) -> str:
    return f"#{quote(heading_id, safe='')}"


def compact(text: str) -> str:
    return " ".join(text.split())


def check_article_route(route: str, failures: list[str]) -> None:
    parser = parse_route(route, failures)
    if parser is None:
        return

    if parser.sidebar_count != 1:
        failures.append(f"{route}: expected 1 docs TOC sidebar, found {parser.sidebar_count}")
    if parser.sidebar_empty_count:
        failures.append(f"{route}: populated docs TOC sidebar must not be marked empty")
    if parser.script_count != 1:
        failures.append(f"{route}: expected 1 docs sidebar activation script, found {parser.script_count}")
    if not parser.headings:
        failures.append(f"{route}: expected article headings for TOC scaffold")
    if len(parser.toc_entries) != len(parser.headings):
        failures.append(
            f"{route}: expected {len(parser.headings)} TOC entries, found {len(parser.toc_entries)}"
        )
        return

    for index, (entry, heading) in enumerate(zip(parser.toc_entries, parser.headings), start=1):
        if entry["href"] != expected_href(heading["id"]):
            failures.append(
                f"{route}: TOC entry {index} href mismatch: expected {expected_href(heading['id'])!r}, "
                f"found {entry['href']!r}"
            )
        if entry["text"] != heading["text"]:
            failures.append(
                f"{route}: TOC entry {index} text mismatch: expected {heading['text']!r}, "
                f"found {entry['text']!r}"
            )
        if entry["level"] != heading["level"] or entry["depth"] != heading["level"]:
            failures.append(
                f"{route}: TOC entry {index} expected level/depth {heading['level']}, found "
                f"{entry['level']!r}/{entry['depth']!r}"
            )


def check_non_article_route(route: str, failures: list[str]) -> None:
    parser = parse_route(route, failures)
    if parser is None:
        return

    if parser.sidebar_count:
        failures.append(f"{route}: non-article page rendered docs TOC sidebar")
    if parser.toc_entries:
        failures.append(f"{route}: non-article page rendered docs TOC entries")
    if parser.script_count:
        failures.append(f"{route}: non-article page included docs sidebar activation script")


def build_fixtures() -> subprocess.CompletedProcess[str]:
    NO_TOC_SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/article.njk
            permalink: /__docs_toc_no_entries/
            lang: en
            localeCode: en
            title: Docs TOC No Entries | fkst
            description: "Smoke fixture for article pages without enough TOC entries."
            articleTitle: Docs TOC no entries fixture
            brandHref: /
            nav: []
            footerText: Docs TOC no entries fixture
            ---
            <section class="content-section" aria-labelledby="only-section">
              <h2 id="only-section" class="heading-anchor-target">Only section{% headingAnchor "only-section", "Only section", "Link to Only section" %}</h2>
              <div>
                <p>This article has one qualifying heading, so it should not render a TOC sidebar.</p>
              </div>
            </section>
            """
        ),
        encoding="utf-8",
    )
    NESTED_SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/article.njk
            permalink: /__docs_toc_nested/
            lang: en
            localeCode: en
            title: Docs TOC Nested | fkst
            description: "Smoke fixture for nested docs TOC entries."
            articleTitle: Docs TOC nested fixture
            brandHref: /
            nav: []
            footerText: Docs TOC nested fixture
            ---
            <section class="content-section" aria-labelledby="alpha">
              <h2 id="alpha" class="heading-anchor-target">Alpha{% headingAnchor "alpha", "Alpha", "Link to Alpha" %}</h2>
              <div>
                <h3 id="alpha-detail" class="heading-anchor-target">Alpha detail{% headingAnchor "alpha-detail", "Alpha detail", "Link to Alpha detail", 3 %}</h3>
                <p>Nested fixture detail.</p>
              </div>
            </section>
            <section class="content-section" aria-labelledby="beta">
              <h2 id="beta" class="heading-anchor-target">Beta{% headingAnchor "beta", "Beta", "Link to Beta" %}</h2>
              <div>
                <p>Second top-level fixture section.</p>
              </div>
            </section>
            """
        ),
        encoding="utf-8",
    )
    try:
        return subprocess.run(
            ["npm", "run", "build"],
            cwd=SITE_ROOT,
            check=False,
            encoding="utf-8",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    finally:
        NO_TOC_SOURCE_FIXTURE.unlink(missing_ok=True)
        NESTED_SOURCE_FIXTURE.unlink(missing_ok=True)


def check_no_toc_fixture(failures: list[str]) -> None:
    parser = DocsTocParser()
    if not NO_TOC_OUTPUT_FIXTURE.is_file():
        failures.append(f"no-entry fixture: missing built file {NO_TOC_OUTPUT_FIXTURE}")
        return

    parser.feed(NO_TOC_OUTPUT_FIXTURE.read_text(encoding="utf-8"))
    if parser.sidebar_count:
        failures.append("no-entry fixture: rendered empty docs TOC sidebar")
    if parser.toc_entries:
        failures.append("no-entry fixture: rendered docs TOC entries")
    if parser.script_count:
        failures.append("no-entry fixture: included docs sidebar activation script")


def check_nested_fixture(failures: list[str]) -> None:
    parser = DocsTocParser()
    if not NESTED_OUTPUT_FIXTURE.is_file():
        failures.append(f"nested fixture: missing built file {NESTED_OUTPUT_FIXTURE}")
        return

    parser.feed(NESTED_OUTPUT_FIXTURE.read_text(encoding="utf-8"))
    expected = [
        {"href": "#alpha", "text": "Alpha", "level": "2", "depth": "2"},
        {"href": "#alpha-detail", "text": "Alpha detail", "level": "3", "depth": "3"},
        {"href": "#beta", "text": "Beta", "level": "2", "depth": "2"},
    ]
    if parser.toc_entries != expected:
        failures.append(f"nested fixture: TOC mismatch: expected {expected!r}, found {parser.toc_entries!r}")


def check_stylesheet(failures: list[str]) -> None:
    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
        return

    style = compact(STYLE_OUTPUT.read_text(encoding="utf-8"))
    for needle in (
        ".docs-sidebar {",
        "position: sticky;",
        ".docs-sidebar-list [data-docs-toc-depth=\"3\"]",
        ".docs-sidebar-list a[aria-current=\"location\"]",
        "@media print",
        ".docs-sidebar",
        "display: none !important;",
    ):
        if needle not in style:
            failures.append(f"stylesheet missing docs TOC contract: {needle}")


def main() -> int:
    failures: list[str] = []
    result = build_fixtures()
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="")
        return result.returncode

    for route in ARTICLE_ROUTES:
        check_article_route(route, failures)
    for route in NON_ARTICLE_ROUTES:
        check_non_article_route(route, failures)
    check_no_toc_fixture(failures)
    check_nested_fixture(failures)
    check_stylesheet(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail DOCS_TOC {failure}")
        return 1

    print(
        "fkst-website dept=site tag=ok DOCS_TOC "
        f"articles={len(ARTICLE_ROUTES)} non_articles={len(NON_ARTICLE_ROUTES)} fixtures=2"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
