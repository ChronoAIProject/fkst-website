#!/usr/bin/env python3
"""Check rendered article table-of-contents contracts."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
OUTPUT_DIR = SITE_DIR / "_site"
STYLE_OUTPUT = OUTPUT_DIR / "assets" / "css" / "style.css"
SCRIPT_OUTPUT = OUTPUT_DIR / "assets" / "js" / "table-of-contents.js"
TOC_MODULE_SOURCE = SITE_DIR / "src" / "_includes" / "toc.js"
TOC_SCRIPT_SOURCE = SITE_DIR / "src" / "assets" / "js" / "table-of-contents.js"

FIXTURES = {
    SITE_DIR / "src" / "__toc_nested.njk": """\
        ---
        layout: layouts/article.njk
        permalink: /__toc_nested/
        lang: en
        title: Nested Table of Contents | fkst
        description: "Nested table-of-contents fixture."
        hasTableOfContents: true
        articleTitle: Nested Table of Contents
        brandHref: /
        nav: []
        languageSwitch: []
        footerText: Fixture
        ---
        <h3 id="orphan-h3">Orphan h3</h3>
        <h2 id="alpha">Alpha</h2>
        <p>Alpha body.</p>
        <h3 id="alpha-child">Alpha child</h3>
        <p>Alpha child body.</p>
        <h2 id="beta">Beta &amp; release</h2>
        <p>Beta body.</p>
        """,
    SITE_DIR / "src" / "__toc_no_headings.njk": """\
        ---
        layout: layouts/article.njk
        permalink: /__toc_no_headings/
        lang: en
        title: No Table of Contents | fkst
        description: "Opted-in fixture with no qualifying TOC headings."
        hasTableOfContents: true
        articleTitle: No Table of Contents
        brandHref: /
        nav: []
        languageSwitch: []
        footerText: Fixture
        ---
        <p>No TOC body survives.</p>
        <h1 id="ignored-h1">Ignored h1</h1>
        <h2>No id heading</h2>
        <h2 id="blank-text"><span> </span></h2>
        <h3 id="">Empty id h3</h3>
        <h4 id="ignored-h4">Ignored h4</h4>
        """,
    SITE_DIR / "src" / "__toc_inline_entities.njk": """\
        ---
        layout: layouts/article.njk
        permalink: /__toc_inline_entities/
        lang: en
        title: Inline Table of Contents | fkst
        description: "Inline markup and entity escaping fixture."
        hasTableOfContents: true
        articleTitle: Inline Table of Contents
        brandHref: /
        nav: []
        languageSwitch: []
        footerText: Fixture
        ---
        <h2 id="inline-entities"><span>Launch</span> &amp; verify <code>&lt;safe&gt;</code> &#35;1</h2>
        <p>Inline body.</p>
        """,
}

ARTICLE_ROUTES = {
    "architecture.html": "Table of contents",
    "doctrine.html": "Table of contents",
    "zh/architecture.html": "\u76ee\u5f55",
    "zh/doctrine.html": "\u76ee\u5f55",
}
NON_TOC_ROUTES = (
    "index.html",
    "zh/index.html",
)
NESTED_FIXTURE_ROUTE = "__toc_nested/index.html"
NO_HEADINGS_FIXTURE_ROUTE = "__toc_no_headings/index.html"
INLINE_FIXTURE_ROUTE = "__toc_inline_entities/index.html"


def class_tokens(value: str | None) -> set[str]:
    return set((value or "").split())


def normalize_text(parts: list[str]) -> str:
    return " ".join("".join(parts).split())


class TocPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.headings: list[dict[str, object]] = []
        self.links: list[dict[str, object]] = []
        self.toc_labels: list[str] = []
        self.toc_titles: list[str] = []
        self.sidebars = 0
        self.script_tags = 0
        self._in_toc = False
        self._toc_list_depth = 0
        self._current_link: dict[str, object] | None = None
        self._current_link_text: list[str] = []
        self._current_heading: dict[str, object] | None = None
        self._current_heading_text: list[str] = []
        self._current_toc_title: list[str] | None = None
        self._page_content_depth = 0
        self._page_content_text: list[str] = []

    @property
    def page_content_text(self) -> str:
        return normalize_text(self._page_content_text)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        classes = class_tokens(attr.get("class"))

        if self._page_content_depth:
            self._page_content_depth += 1
        elif tag == "div" and "page-content" in classes and not self._in_toc:
            self._page_content_depth = 1

        if tag == "nav" and "data-toc-nav" in attr:
            self._in_toc = True
            self.sidebars += 1
            self.toc_labels.append(attr.get("aria-label") or "")

        if tag == "script" and "data-toc-script" in attr:
            self.script_tags += 1

        if self._in_toc and tag == "ol":
            self._toc_list_depth += 1

        if self._in_toc and tag == "p" and "toc-title" in classes:
            self._current_toc_title = []

        if self._in_toc and tag == "a":
            self._current_link = {
                "href": attr.get("href") or "",
                "depth": self._toc_list_depth,
                "aria_current": attr.get("aria-current"),
            }
            self._current_link_text = []

        if self._page_content_depth and not self._in_toc and tag in {"h2", "h3"}:
            self._current_heading = {
                "level": int(tag[1]),
                "id": attr.get("id") or "",
            }
            self._current_heading_text = []

    def handle_endtag(self, tag: str) -> None:
        if self._current_heading is not None and tag == f"h{self._current_heading['level']}":
            self._current_heading["text"] = normalize_text(self._current_heading_text)
            self.headings.append(self._current_heading)
            self._current_heading = None
            self._current_heading_text = []

        if self._in_toc and tag == "a" and self._current_link is not None:
            self._current_link["text"] = normalize_text(self._current_link_text)
            self.links.append(self._current_link)
            self._current_link = None
            self._current_link_text = []

        if self._in_toc and tag == "p" and self._current_toc_title is not None:
            self.toc_titles.append(normalize_text(self._current_toc_title))
            self._current_toc_title = None

        if self._in_toc and tag == "ol":
            self._toc_list_depth -= 1

        if self._in_toc and tag == "nav":
            self._in_toc = False

        if self._page_content_depth:
            self._page_content_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._current_heading is not None:
            self._current_heading_text.append(data)
        if self._current_link is not None:
            self._current_link_text.append(data)
        if self._current_toc_title is not None:
            self._current_toc_title.append(data)
        if self._page_content_depth:
            self._page_content_text.append(data)


def write_fixtures() -> None:
    for path, source in FIXTURES.items():
        path.write_text(textwrap.dedent(source), encoding="utf-8")


def remove_fixtures() -> None:
    for path in FIXTURES:
        path.unlink(missing_ok=True)


def build_fixtures() -> subprocess.CompletedProcess[str]:
    write_fixtures()
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
        remove_fixtures()


def parse_output(route: str, failures: list[str]) -> tuple[str, TocPageParser] | None:
    path = OUTPUT_DIR / route
    if not path.is_file():
        failures.append(f"{route}: missing built file {path}")
        return None

    html = path.read_text(encoding="utf-8")
    parser = TocPageParser()
    parser.feed(html)
    return html, parser


def expected_links_from_headings(headings: list[dict[str, object]]) -> list[dict[str, object]]:
    expected: list[dict[str, object]] = []
    has_parent = False

    for heading in headings:
        text = str(heading.get("text") or "")
        heading_id = str(heading.get("id") or "")
        level = int(heading["level"])
        if not heading_id or not text:
            continue

        if level == 2:
            depth = 1
            has_parent = True
        else:
            depth = 2 if has_parent else 1

        expected.append({
            "href": f"#{heading_id}",
            "text": text,
            "depth": depth,
        })

    return expected


def observed_links(links: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        {
            "href": str(link["href"]),
            "text": str(link["text"]),
            "depth": int(link["depth"]),
        }
        for link in links
    ]


def assert_toc_contract(
    route: str,
    failures: list[str],
    expected_label: str = "Table of contents",
) -> TocPageParser | None:
    parsed = parse_output(route, failures)
    if parsed is None:
        return None

    _html, parser = parsed
    if parser.sidebars != 1:
        failures.append(f"{route}: expected 1 TOC navigation landmark, found {parser.sidebars}")
    if parser.script_tags != 1:
        failures.append(f"{route}: expected 1 TOC enhancement script, found {parser.script_tags}")
    if parser.toc_labels != [expected_label]:
        failures.append(f"{route}: expected localized TOC aria-label {expected_label!r}, found {parser.toc_labels!r}")
    if parser.toc_titles != [expected_label]:
        failures.append(f"{route}: expected localized TOC title {expected_label!r}, found {parser.toc_titles!r}")

    expected = expected_links_from_headings(parser.headings)
    observed = observed_links(parser.links)
    if observed != expected:
        failures.append(f"{route}: TOC links differ from rendered article headings: expected {expected!r}, found {observed!r}")

    for link in parser.links:
        if link["aria_current"] is not None:
            failures.append(f"{route}: static TOC link should not pre-set aria-current")

    return parser


def assert_no_toc(route: str, failures: list[str]) -> TocPageParser | None:
    parsed = parse_output(route, failures)
    if parsed is None:
        return None

    _html, parser = parsed
    if parser.sidebars:
        failures.append(f"{route}: page rendered an empty or unexpected TOC sidebar")
    if parser.script_tags:
        failures.append(f"{route}: page rendered the TOC script without TOC entries")
    return parser


def extract_toc_html(html: str) -> str:
    match = re.search(r"<nav\b[^>]*data-toc-nav[\s\S]*?</nav>", html)
    return match.group(0) if match else ""


def assert_nested_fixture(failures: list[str]) -> None:
    parser = assert_toc_contract(NESTED_FIXTURE_ROUTE, failures)
    if parser is None:
        return

    expected = [
        {"href": "#orphan-h3", "text": "Orphan h3", "depth": 1},
        {"href": "#alpha", "text": "Alpha", "depth": 1},
        {"href": "#alpha-child", "text": "Alpha child", "depth": 2},
        {"href": "#beta", "text": "Beta & release", "depth": 1},
    ]
    if observed_links(parser.links) != expected:
        failures.append(f"{NESTED_FIXTURE_ROUTE}: nested h3 TOC order/depth regressed")


def assert_no_headings_fixture(failures: list[str]) -> None:
    parser = assert_no_toc(NO_HEADINGS_FIXTURE_ROUTE, failures)
    if parser is None:
        return

    if "No TOC body survives." not in parser.page_content_text:
        failures.append(f"{NO_HEADINGS_FIXTURE_ROUTE}: normal article body content did not render")


def assert_inline_fixture(failures: list[str]) -> None:
    parsed = parse_output(INLINE_FIXTURE_ROUTE, failures)
    if parsed is None:
        return

    html, parser = parsed
    assert_toc_contract(INLINE_FIXTURE_ROUTE, failures)
    expected_text = "Launch & verify <safe> #1"
    if observed_links(parser.links) != [{"href": "#inline-entities", "text": expected_text, "depth": 1}]:
        failures.append(f"{INLINE_FIXTURE_ROUTE}: inline markup/entity TOC text was not normalized")

    toc_html = extract_toc_html(html)
    if "<span" in toc_html or "<code" in toc_html:
        failures.append(f"{INLINE_FIXTURE_ROUTE}: TOC rendered raw inline heading markup")
    if "Launch &amp; verify &lt;safe&gt; #1" not in toc_html:
        failures.append(f"{INLINE_FIXTURE_ROUTE}: TOC did not render escaped normalized heading text")


def assert_layout_assets(failures: list[str]) -> None:
    if not SCRIPT_OUTPUT.is_file():
        failures.append(f"missing built TOC script asset {SCRIPT_OUTPUT}")

    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
        return

    style = STYLE_OUTPUT.read_text(encoding="utf-8")
    for needle in (
        ".article-shell",
        ".toc-sidebar",
        "position: sticky",
        ".toc-list-nested",
        '@media (max-width: 900px)',
    ):
        if needle not in style:
            failures.append(f"stylesheet missing TOC layout rule: {needle}")


def main() -> int:
    if not TOC_MODULE_SOURCE.is_file() or not TOC_SCRIPT_SOURCE.is_file():
        print("fkst-website dept=site tag=skip TABLE_OF_CONTENTS implementation=absent")
        return 0

    failures: list[str] = []
    result = build_fixtures()
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="")
        return result.returncode

    for route, label in ARTICLE_ROUTES.items():
        assert_toc_contract(route, failures, label)
    for route in NON_TOC_ROUTES:
        assert_no_toc(route, failures)
    assert_nested_fixture(failures)
    assert_no_headings_fixture(failures)
    assert_inline_fixture(failures)
    assert_layout_assets(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail TABLE_OF_CONTENTS {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok TABLE_OF_CONTENTS pages={len(ARTICLE_ROUTES)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
