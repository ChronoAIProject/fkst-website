#!/usr/bin/env python3
"""Smoke-check outbound link markers."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
SOURCE_FIXTURE = SITE_DIR / "src" / "__external_link_smoke.md"
OUTPUT_FIXTURE = SITE_DIR / "_site" / "__external_link_smoke" / "index.html"
HOME_OUTPUT = SITE_DIR / "_site" / "index.html"
STYLE_OUTPUT = SITE_DIR / "_site" / "assets" / "css" / "style.css"


class ExternalLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.anchor_count: dict[str, int] = {}
        self.external_class_count: dict[str, int] = {}
        self.external_data_count: dict[str, int] = {}
        self.marker_count: dict[str, int] = {}
        self.hidden_text: dict[str, list[str]] = {}
        self._href_stack: list[str] = []
        self._in_hidden = False

    @property
    def _current_href(self) -> str | None:
        return self._href_stack[-1] if self._href_stack else None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "a":
            href = attr.get("href") or ""
            self._href_stack.append(href)
            self.anchor_count[href] = self.anchor_count.get(href, 0) + 1
            classes = set((attr.get("class") or "").split())
            if "external-link" in classes:
                self.external_class_count[href] = self.external_class_count.get(href, 0) + 1
            if "data-external-link" in attr:
                self.external_data_count[href] = self.external_data_count.get(href, 0) + 1
            return

        href = self._current_href
        if tag == "span" and href:
            classes = set((attr.get("class") or "").split())
            if "external-link-marker" in classes:
                self.marker_count[href] = self.marker_count.get(href, 0) + 1
            if "visually-hidden" in classes:
                self._in_hidden = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href_stack:
            self._href_stack.pop()
        if tag == "span":
            self._in_hidden = False

    def handle_data(self, data: str) -> None:
        href = self._current_href
        if self._in_hidden and href:
            self.hidden_text.setdefault(href, []).append(data)


def check_classifier() -> list[str]:
    script = r"""
const assert = require("node:assert/strict");
const {
  isExternalLinkTarget,
  shouldUseEleventyUrlFilter
} = require("./site/lib/externalLinks");

assert.equal(isExternalLinkTarget("https://example.com/docs"), true);
assert.equal(isExternalLinkTarget("http://example.com/docs"), true);
assert.equal(isExternalLinkTarget("//example.com/docs"), true);
assert.equal(isExternalLinkTarget("https://chronoaiproject.github.io/fkst-website/"), false);
assert.equal(isExternalLinkTarget("//chronoaiproject.github.io/fkst-website/"), false);
assert.equal(isExternalLinkTarget("/architecture.html"), false);
assert.equal(isExternalLinkTarget("architecture.html"), false);
assert.equal(isExternalLinkTarget("#section"), false);
assert.equal(isExternalLinkTarget("mailto:team@example.com"), false);
assert.equal(isExternalLinkTarget("tel:+15550100"), false);
assert.equal(shouldUseEleventyUrlFilter("/architecture.html"), true);
assert.equal(shouldUseEleventyUrlFilter("architecture.html"), true);
assert.equal(shouldUseEleventyUrlFilter("#section"), false);
assert.equal(shouldUseEleventyUrlFilter("mailto:team@example.com"), false);
assert.equal(shouldUseEleventyUrlFilter("tel:+15550100"), false);
assert.equal(shouldUseEleventyUrlFilter("https://example.com/docs"), false);
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=False,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode == 0:
        return []
    return [f"classifier contract failed:\n{result.stdout}{result.stderr}"]


def build_fixture() -> subprocess.CompletedProcess[str]:
    SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/page.njk
            permalink: /__external_link_smoke/
            lang: en
            title: External Link Smoke | fkst
            description: "Smoke fixture for outbound link markers."
            brandHref: /
            nav: []
            languageSwitch: []
            footerText: Smoke fixture
            ---

            [Outbound](https://example.com/docs)
            [Site absolute](https://chronoaiproject.github.io/fkst-website/)
            [Root internal](/architecture.html)
            [Relative](architecture.html)
            [Hash](#section)
            [Email](mailto:team@example.com)
            [Phone](tel:+15550100)
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


def parse_html(path: Path, failures: list[str]) -> ExternalLinkParser | None:
    if not path.is_file():
        failures.append(f"missing built file {path}")
        return None

    parser = ExternalLinkParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def assert_marked(parser: ExternalLinkParser, href: str, failures: list[str]) -> None:
    if parser.marker_count.get(href, 0) != 1:
        failures.append(f"{href}: expected exactly one external-link marker")
    if parser.hidden_text.get(href, []) != ["External link"]:
        failures.append(f"{href}: expected accessible External link text")


def assert_marked_at_least(parser: ExternalLinkParser, href: str, minimum: int, failures: list[str]) -> None:
    if parser.marker_count.get(href, 0) < minimum:
        failures.append(f"{href}: expected at least {minimum} external-link marker(s)")
    if parser.external_class_count.get(href, 0) < minimum:
        failures.append(f"{href}: expected at least {minimum} external-link class hook(s)")
    if parser.external_data_count.get(href, 0) < minimum:
        failures.append(f"{href}: expected at least {minimum} data-external-link hook(s)")
    if len(parser.hidden_text.get(href, [])) < minimum:
        failures.append(f"{href}: expected at least {minimum} accessible External link text node(s)")


def assert_unmarked(parser: ExternalLinkParser, href: str, failures: list[str]) -> None:
    if parser.marker_count.get(href, 0):
        failures.append(f"{href}: internal or non-http link received an external-link marker")
    if parser.hidden_text.get(href):
        failures.append(f"{href}: internal or non-http link received hidden external text")


def main() -> int:
    failures = check_classifier()
    result = build_fixture()
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="")
        return result.returncode

    fixture = parse_html(OUTPUT_FIXTURE, failures)
    if fixture:
        assert_marked(fixture, "https://example.com/docs", failures)
        if fixture.external_class_count.get("https://example.com/docs", 0) != 1:
            failures.append("markdown outbound link is missing the external-link class")
        if fixture.external_data_count.get("https://example.com/docs", 0) != 1:
            failures.append("markdown outbound link is missing data-external-link")
        for href in (
            "https://chronoaiproject.github.io/fkst-website/",
            "/architecture.html",
            "architecture.html",
            "#section",
            "mailto:team@example.com",
            "tel:+15550100",
        ):
            assert_unmarked(fixture, href, failures)

    home = parse_html(HOME_OUTPUT, failures)
    if home:
        assert_marked_at_least(
            home,
            "https://github.com/ChronoAIProject/fkst-substrate",
            2,
            failures,
        )
        assert_marked_at_least(
            home,
            "https://github.com/ChronoAIProject/fkst-packages",
            2,
            failures,
        )
        assert_marked_at_least(
            home,
            "https://github.com/ChronoAIProject/fkst-website",
            2,
            failures,
        )
        assert_unmarked(home, "/fkst-website/architecture.html", failures)

    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
    else:
        style = STYLE_OUTPUT.read_text(encoding="utf-8")
        for needle in (".external-link-marker", ".visually-hidden"):
            if needle not in style:
                failures.append(f"stylesheet missing external-link rule: {needle}")

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail EXTERNAL_LINKS {failure}")
        return 1

    print("fkst-website dept=site tag=ok EXTERNAL_LINKS outbound=1 internal=6")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
