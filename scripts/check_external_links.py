#!/usr/bin/env python3
"""Check rendered outbound link markers."""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
MARKDOWN_SOURCE_FIXTURE = SITE_DIR / "src" / "__external_link_smoke.md"
MARKDOWN_OUTPUT_FIXTURE = SITE_DIR / "_site" / "__external_link_smoke" / "index.html"
FOOTER_SOURCE_FIXTURE = SITE_DIR / "src" / "__external_link_internal_footer.njk"
FOOTER_OUTPUT_FIXTURE = SITE_DIR / "_site" / "__external_link_internal_footer" / "index.html"
HOME_OUTPUTS = (
    ("English homepage", SITE_DIR / "_site" / "index.html"),
    ("Chinese homepage", SITE_DIR / "_site" / "zh" / "index.html"),
)
STYLE_OUTPUT = SITE_DIR / "_site" / "assets" / "css" / "style.css"
REPOSITORY_LINKS = (
    "https://github.com/ChronoAIProject/fkst-substrate",
    "https://github.com/ChronoAIProject/fkst-packages",
    "https://github.com/ChronoAIProject/fkst-website",
)


@dataclass
class AnchorRecord:
    href: str
    attrs: dict[str, str]
    marker_count: int = 0
    hidden_text: list[str] = field(default_factory=list)


class ExternalLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.anchors: list[AnchorRecord] = []
        self._anchor_stack: list[AnchorRecord] = []
        self._hidden_depth = 0

    @property
    def _current_anchor(self) -> AnchorRecord | None:
        return self._anchor_stack[-1] if self._anchor_stack else None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {name: value or "" for name, value in attrs}
        if tag == "a":
            anchor = AnchorRecord(href=attr.get("href", ""), attrs=attr)
            self.anchors.append(anchor)
            self._anchor_stack.append(anchor)
            return

        anchor = self._current_anchor
        if tag == "span" and anchor:
            classes = set((attr.get("class") or "").split())
            if "external-link-marker" in classes:
                anchor.marker_count += 1
            if "visually-hidden" in classes:
                self._hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._anchor_stack:
            self._anchor_stack.pop()
        if tag == "span" and self._hidden_depth:
            self._hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        anchor = self._current_anchor
        if anchor and self._hidden_depth:
            anchor.hidden_text.append(data)


def build_fixtures() -> subprocess.CompletedProcess[str]:
    MARKDOWN_SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/page.njk
            permalink: /__external_link_smoke/
            lang: en
            title: External Link Smoke | fkst
            description: "Smoke fixture for outbound link markers."
            brandHref: /
            nav:
              - label: Internal nav
                href: /architecture.html
              - label: External nav
                href: https://example.com/nav
              - label: Protocol nav
                href: //example.com/protocol-nav
              - label: Same-origin nav
                href: https://chronoaiproject.github.io/fkst-website/nav
              - label: Email nav
                href: mailto:nav@example.com
            localeCode: en
            localeAlternates:
              en: /__external_link_smoke/
              zh-CN: https://example.com/language
            footerHref: https://example.com/footer
            footerLabel: External footer
            ---

            [Outbound HTTPS](https://example.com/docs)
            [Outbound HTTP](http://example.org/docs)
            [Protocol external](//example.net/docs)
            [Same origin absolute](https://chronoaiproject.github.io/fkst-website/docs)
            [Same origin protocol](//chronoaiproject.github.io/fkst-website/docs)
            [Root internal](/architecture.html)
            [Relative](architecture.html)
            [Hash](#section)
            [Email](mailto:team@example.com)
            [Phone](tel:+15550100)
            """
        ),
        encoding="utf-8",
    )
    FOOTER_SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/page.njk
            permalink: /__external_link_internal_footer/
            lang: en
            title: External Link Internal Footer | fkst
            description: "Smoke fixture for internal footer link handling."
            brandHref: /
            nav:
              - label: Internal nav
                href: /doctrine.html
            localeCode: en
            localeAlternates:
              en: /__external_link_internal_footer/
              zh-CN: /zh/
            footerHref: /architecture.html
            footerLabel: Internal footer
            ---
            <p>Internal footer fixture.</p>
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
        MARKDOWN_SOURCE_FIXTURE.unlink(missing_ok=True)
        FOOTER_SOURCE_FIXTURE.unlink(missing_ok=True)


def parse_html(path: Path, failures: list[str]) -> ExternalLinkParser | None:
    if not path.is_file():
        failures.append(f"missing built file {path}")
        return None

    parser = ExternalLinkParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def class_tokens(anchor: AnchorRecord) -> list[str]:
    return (anchor.attrs.get("class") or "").split()


def anchors_for(parser: ExternalLinkParser, href: str) -> list[AnchorRecord]:
    return [anchor for anchor in parser.anchors if anchor.href == href]


def assert_marked_anchor(anchor: AnchorRecord, context: str, failures: list[str]) -> None:
    classes = class_tokens(anchor)
    if anchor.marker_count != 1:
        failures.append(f"{context}: expected exactly one external-link marker, found {anchor.marker_count}")
    if anchor.hidden_text != ["External link"]:
        failures.append(f"{context}: expected exactly one hidden External link text node, found {anchor.hidden_text!r}")
    if classes.count("external-link") != 1:
        failures.append(f"{context}: expected exactly one external-link class hook, found {classes!r}")
    if "data-external-link" not in anchor.attrs:
        failures.append(f"{context}: missing data-external-link hook")
    if "target" in anchor.attrs:
        failures.append(f"{context}: external-link handling must not introduce target attributes")


def assert_unmarked_anchor(anchor: AnchorRecord, context: str, failures: list[str]) -> None:
    classes = class_tokens(anchor)
    if anchor.marker_count:
        failures.append(f"{context}: non-external link received {anchor.marker_count} external-link marker(s)")
    if anchor.hidden_text:
        failures.append(f"{context}: non-external link received hidden external text {anchor.hidden_text!r}")
    if "external-link" in classes:
        failures.append(f"{context}: non-external link received external-link class")
    if "data-external-link" in anchor.attrs:
        failures.append(f"{context}: non-external link received data-external-link")
    if "target" in anchor.attrs:
        failures.append(f"{context}: link handling must not introduce target attributes")


def assert_exact_marked_href(
    parser: ExternalLinkParser,
    href: str,
    context: str,
    failures: list[str],
) -> None:
    anchors = anchors_for(parser, href)
    if len(anchors) != 1:
        failures.append(f"{context}: expected exactly one anchor with href {href}, found {len(anchors)}")
        return
    assert_marked_anchor(anchors[0], context, failures)


def assert_exact_unmarked_href(
    parser: ExternalLinkParser,
    href: str,
    context: str,
    failures: list[str],
) -> None:
    anchors = anchors_for(parser, href)
    if len(anchors) != 1:
        failures.append(f"{context}: expected exactly one anchor with href {href}, found {len(anchors)}")
        return
    assert_unmarked_anchor(anchors[0], context, failures)


def assert_fixture_markup(parser: ExternalLinkParser, failures: list[str]) -> None:
    for href, context in (
        ("https://example.com/nav", "fixture nav external link"),
        ("//example.com/protocol-nav", "fixture nav protocol-relative external link"),
        ("https://example.com/language", "fixture language external link"),
        ("https://example.com/footer", "fixture footer external link"),
        ("https://example.com/docs", "fixture Markdown HTTPS external link"),
        ("http://example.org/docs", "fixture Markdown HTTP external link"),
        ("//example.net/docs", "fixture Markdown protocol-relative external link"),
    ):
        assert_exact_marked_href(parser, href, context, failures)

    for href, context in (
        ("/fkst-website/architecture.html", "fixture nav internal url-filtered link"),
        (
            "https://chronoaiproject.github.io/fkst-website/nav",
            "fixture nav same-origin absolute link",
        ),
        ("mailto:nav@example.com", "fixture nav mailto link"),
        (
            "https://chronoaiproject.github.io/fkst-website/docs",
            "fixture Markdown same-origin absolute link",
        ),
        (
            "//chronoaiproject.github.io/fkst-website/docs",
            "fixture Markdown same-origin protocol-relative link",
        ),
        ("/architecture.html", "fixture Markdown root-relative link"),
        ("architecture.html", "fixture Markdown relative link"),
        ("#section", "fixture Markdown hash link"),
        ("mailto:team@example.com", "fixture Markdown mailto link"),
        ("tel:+15550100", "fixture Markdown tel link"),
    ):
        assert_exact_unmarked_href(parser, href, context, failures)


def assert_internal_footer_fixture(parser: ExternalLinkParser, failures: list[str]) -> None:
    for href, context in (
        ("/fkst-website/doctrine.html", "internal footer fixture nav url-filtered link"),
        ("/fkst-website/zh/", "internal footer fixture language url-filtered link"),
        ("/fkst-website/architecture.html", "internal footer fixture footer url-filtered link"),
    ):
        assert_exact_unmarked_href(parser, href, context, failures)


def assert_homepage_repository_links(
    label: str,
    parser: ExternalLinkParser,
    failures: list[str],
) -> None:
    for href in REPOSITORY_LINKS:
        anchors = anchors_for(parser, href)
        if len(anchors) != 2:
            failures.append(f"{label}: expected exactly 2 repository anchors for {href}, found {len(anchors)}")
            continue
        for index, anchor in enumerate(anchors, start=1):
            assert_marked_anchor(anchor, f"{label}: repository link {href} #{index}", failures)

    primary = [
        anchor
        for anchor in anchors_for(parser, "https://github.com/ChronoAIProject/fkst-substrate")
        if "primary-action" in class_tokens(anchor)
    ]
    if len(primary) != 1:
        failures.append(f"{label}: expected exactly one primary-action fkst-substrate repository link, found {len(primary)}")
    elif "external-link" not in class_tokens(primary[0]):
        failures.append(f"{label}: primary-action repository link lost external-link class")


def assert_homepage_internal_links(
    label: str,
    parser: ExternalLinkParser,
    failures: list[str],
) -> None:
    expected = (
        ("/fkst-website/architecture.html", "English architecture nav")
        if label == "English homepage"
        else ("/fkst-website/zh/architecture.html", "Chinese architecture nav")
    )
    assert_exact_unmarked_href(parser, expected[0], f"{label}: {expected[1]}", failures)


def check_stylesheet(failures: list[str]) -> None:
    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
        return

    style = STYLE_OUTPUT.read_text(encoding="utf-8")
    for needle in (".external-link-marker", ".visually-hidden"):
        if needle not in style:
            failures.append(f"stylesheet missing external-link rule: {needle}")


def main() -> int:
    failures: list[str] = []
    result = build_fixtures()
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="")
        return result.returncode

    fixture = parse_html(MARKDOWN_OUTPUT_FIXTURE, failures)
    if fixture:
        assert_fixture_markup(fixture, failures)

    internal_footer = parse_html(FOOTER_OUTPUT_FIXTURE, failures)
    if internal_footer:
        assert_internal_footer_fixture(internal_footer, failures)

    for label, path in HOME_OUTPUTS:
        home = parse_html(path, failures)
        if home:
            assert_homepage_repository_links(label, home, failures)
            assert_homepage_internal_links(label, home, failures)

    check_stylesheet(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail EXTERNAL_LINKS {failure}")
        return 1

    print("fkst-website dept=site tag=ok EXTERNAL_LINKS fixtures=2 homepages=2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
