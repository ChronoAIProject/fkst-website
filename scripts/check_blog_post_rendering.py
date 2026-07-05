#!/usr/bin/env python3
"""Characterize the current rendered blog post article surface."""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
import shutil
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"

RICH_SOURCE_FIXTURE = SITE_DIR / "src" / "__blog_post_rendering_characterization.md"
RICH_DATA_FIXTURE = SITE_DIR / "src" / "__blog_post_rendering_characterization.11tydata.js"
RICH_OUTPUT_FIXTURE = SITE_DIR / "_site" / "blog" / "__rendering_characterization" / "index.html"
MINIMAL_SOURCE_FIXTURE = SITE_DIR / "src" / "__blog_post_rendering_minimal.md"
MINIMAL_DATA_FIXTURE = SITE_DIR / "src" / "__blog_post_rendering_minimal.11tydata.js"
MINIMAL_OUTPUT_FIXTURE = SITE_DIR / "_site" / "blog" / "__rendering_minimal" / "index.html"

RICH_TITLE = "Browser tab title for pinned blog post | fkst"
RICH_DESCRIPTION = "Search description for the pinned blog rendering fixture."
RICH_ARTICLE_TITLE = "Pinned blog post rendering behavior"
RICH_INTRO = "Excerpt-style intro text stays in the article header."
RICH_CODE = 'const value = "<article>";\nconsole.log("blog rendering characterization", value);\n'
MINIMAL_TITLE = "Minimal blog fallback title | fkst"
MINIMAL_DESCRIPTION = "Minimal blog fixture."


@dataclass
class TextRecord:
    attrs: dict[str, str]
    parts: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return normalize_text("".join(self.parts))

    @property
    def raw_text(self) -> str:
        return "".join(self.parts)


@dataclass
class AnchorRecord:
    href: str
    attrs: dict[str, str]
    marker_count: int = 0
    hidden_text: list[str] = field(default_factory=list)


@dataclass
class CodeBlockRecord:
    attrs: dict[str, str]
    button_count: int = 0
    disabled_buttons: int = 0
    hidden_buttons: int = 0
    status_count: int = 0
    button_text: list[str] = field(default_factory=list)
    status_text: list[str] = field(default_factory=list)
    code_text: list[str] = field(default_factory=list)


class BlogPostRenderingParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.document_title = TextRecord(attrs={})
        self.meta_descriptions: list[str] = []
        self.article_headers: list[dict[str, str]] = []
        self.header_h1s: list[TextRecord] = []
        self.eyebrows: list[TextRecord] = []
        self.reading_times: list[TextRecord] = []
        self.intros: list[TextRecord] = []
        self.article_shells: list[dict[str, str]] = []
        self.article_contents: list[dict[str, str]] = []
        self.content_headings: list[TextRecord] = []
        self.content_images: list[dict[str, str]] = []
        self.anchors: list[AnchorRecord] = []
        self.code_blocks: list[CodeBlockRecord] = []
        self.time_records: list[TextRecord] = []
        self.category_badges: list[dict[str, str]] = []
        self.scripts: list[dict[str, str]] = []
        self.content_text: list[str] = []

        self._captures: list[tuple[str, list[str]]] = []
        self._section_stack: list[dict[str, bool]] = []
        self._div_stack: list[dict[str, bool]] = []
        self._span_stack: list[dict[str, bool]] = []
        self._anchor_stack: list[AnchorRecord] = []
        self._code_block_stack: list[CodeBlockRecord] = []
        self._header_depth = 0
        self._content_depth = 0
        self._hidden_anchor_depth = 0

    @property
    def in_header(self) -> bool:
        return self._header_depth > 0

    @property
    def in_content(self) -> bool:
        return self._content_depth > 0

    @property
    def current_anchor(self) -> AnchorRecord | None:
        return self._anchor_stack[-1] if self._anchor_stack else None

    @property
    def current_code_block(self) -> CodeBlockRecord | None:
        return self._code_block_stack[-1] if self._code_block_stack else None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = normalize_attrs(attrs)
        classes = class_tokens(attr)

        if tag == "title":
            self._push_capture(tag, self.document_title.parts)
            return

        if tag == "meta" and attr.get("name") == "description":
            self.meta_descriptions.append(attr.get("content", ""))
            return

        if tag == "section":
            is_article_header = "page-header" in classes and "article-header" in classes
            self._section_stack.append({"article_header": is_article_header})
            if is_article_header:
                self._header_depth += 1
                self.article_headers.append(attr)
            return

        if tag == "div":
            is_article_shell = "data-article-shell" in attr
            is_article_content = "data-article-scroll-content" in attr
            is_code_block = "data-code-block-copy" in attr
            self._div_stack.append(
                {
                    "article_content": is_article_content,
                    "code_block": is_code_block,
                }
            )
            if is_article_shell:
                self.article_shells.append(attr)
            if is_article_content:
                self._content_depth += 1
                self.article_contents.append(attr)
            if is_code_block:
                block = CodeBlockRecord(attrs=attr)
                self.code_blocks.append(block)
                self._code_block_stack.append(block)
            return

        block = self.current_code_block
        if block and tag == "span" and "data-code-block-copy-status" in attr:
            block.status_count += 1
            self._push_capture(tag, block.status_text)
            self._span_stack.append({"hidden_anchor_text": False})
            return

        if tag == "span":
            is_hidden_anchor_text = False
            if "blog-category-badge" in classes:
                self.category_badges.append(attr)
            if self.current_anchor:
                if "external-link-marker" in classes:
                    self.current_anchor.marker_count += 1
                if "visually-hidden" in classes:
                    is_hidden_anchor_text = True
                    self._hidden_anchor_depth += 1
            self._span_stack.append({"hidden_anchor_text": is_hidden_anchor_text})
            return

        if tag == "a":
            anchor = AnchorRecord(href=attr.get("href", ""), attrs=attr)
            self.anchors.append(anchor)
            self._anchor_stack.append(anchor)
            return

        if tag == "img" and self.in_content:
            self.content_images.append(attr)
            return

        if tag == "script":
            self.scripts.append(attr)
            return

        if tag == "time":
            record = TextRecord(attrs=attr)
            self.time_records.append(record)
            self._push_capture(tag, record.parts)
            return

        if self.in_header and tag == "h1":
            record = TextRecord(attrs=attr)
            self.header_h1s.append(record)
            self._push_capture(tag, record.parts)
            return

        if self.in_header and tag == "p" and "eyebrow" in classes:
            record = TextRecord(attrs=attr)
            self.eyebrows.append(record)
            self._push_capture(tag, record.parts)
            return

        if self.in_header and tag == "p" and "data-reading-time" in attr:
            record = TextRecord(attrs=attr)
            self.reading_times.append(record)
            self._push_capture(tag, record.parts)
            return

        if self.in_header and tag == "p" and "page-intro" in classes:
            record = TextRecord(attrs=attr)
            self.intros.append(record)
            self._push_capture(tag, record.parts)
            return

        if self.in_content and tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            record = TextRecord(attrs={"tag": tag, **attr})
            self.content_headings.append(record)
            self._push_capture(tag, record.parts)
            return

        if block and tag == "button" and "data-code-block-copy-button" in attr:
            block.button_count += 1
            if "disabled" in attr:
                block.disabled_buttons += 1
            if "hidden" in attr:
                block.hidden_buttons += 1
            self._push_capture(tag, block.button_text)
            return

        if block and tag == "code":
            self._push_capture(tag, block.code_text)

    def handle_endtag(self, tag: str) -> None:
        if tag == "section" and self._section_stack:
            markers = self._section_stack.pop()
            if markers["article_header"]:
                self._header_depth -= 1
        elif tag == "div" and self._div_stack:
            markers = self._div_stack.pop()
            if markers["article_content"]:
                self._content_depth -= 1
            if markers["code_block"] and self._code_block_stack:
                self._code_block_stack.pop()
        elif tag == "span" and self._span_stack:
            markers = self._span_stack.pop()
            if markers["hidden_anchor_text"]:
                self._hidden_anchor_depth -= 1
        elif tag == "a" and self._anchor_stack:
            self._anchor_stack.pop()

        self._pop_capture(tag)

    def handle_data(self, data: str) -> None:
        if self.in_content:
            self.content_text.append(data)
        if self.current_anchor and self._hidden_anchor_depth:
            self.current_anchor.hidden_text.append(data)
        for _tag, parts in self._captures:
            parts.append(data)

    def _push_capture(self, tag: str, parts: list[str]) -> None:
        self._captures.append((tag, parts))

    def _pop_capture(self, tag: str) -> None:
        for index in range(len(self._captures) - 1, -1, -1):
            if self._captures[index][0] == tag:
                del self._captures[index]
                return


def normalize_attrs(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
    return {name: value or "" for name, value in attrs}


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def class_tokens(attrs: dict[str, str]) -> set[str]:
    return set((attrs.get("class") or "").split())


def write_fixtures() -> None:
    RICH_SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            f"""\
            ---
            layout: layouts/article.njk
            permalink: /blog/__rendering_characterization/
            image: /assets/img/homepage-hero-illustration.svg
            brandHref: /
            nav:
              - label: Blog
                href: /blog.html
                current: true
            footerText: Blog post rendering smoke fixture.
            eleventyComputed:
              lastUpdated:
            ---

            Opening paragraph with **strong text** and `inline code`.

            ## Rendered body heading

            The body keeps [an internal link](/architecture.html) and
            [an external link](https://example.com/blog-rendering).

            ![Homepage hero illustration](/assets/img/homepage-hero-illustration.svg)

            ```js
            const value = "<article>";
            console.log("blog rendering characterization", value);
            ```

            Closing paragraph after the image and code block.
            """
        ),
        encoding="utf-8",
    )
    MINIMAL_SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            f"""\
            ---
            layout: layouts/article.njk
            permalink: /blog/__rendering_minimal/
            brandHref: /
            nav: []
            footerText: Minimal blog post rendering fixture.
            eleventyComputed:
              lastUpdated:
            ---

            Minimal body copy only.
            """
        ),
        encoding="utf-8",
    )
    RICH_DATA_FIXTURE.write_text(
        textwrap.dedent(
            f"""\
            "use strict";

            const {{ parseTypedPost }} = require("../lib/posts");

            module.exports = {{
              lang: "en",
              localeCode: "en",
              title: "{RICH_TITLE}",
              description: "{RICH_DESCRIPTION}",
              post: parseTypedPost({{
                articleEyebrow: "Blog",
                articleIntro: "{RICH_INTRO}",
                articleTitle: "{RICH_ARTICLE_TITLE}",
                category: {{ slug: "news" }},
                description: "{RICH_DESCRIPTION}",
                lang: "en",
                localeCode: "en",
                permalink: "/blog/__rendering_characterization/",
                publishedDate: "2026-07-04",
                title: "{RICH_TITLE}",
              }}),
            }};
            """
        ),
        encoding="utf-8",
    )
    MINIMAL_DATA_FIXTURE.write_text(
        textwrap.dedent(
            f"""\
            "use strict";

            const {{ parseTypedPost }} = require("../lib/posts");

            module.exports = {{
              lang: "en",
              localeCode: "en",
              title: "{MINIMAL_TITLE}",
              description: "{MINIMAL_DESCRIPTION}",
              post: parseTypedPost({{
                description: "{MINIMAL_DESCRIPTION}",
                lang: "en",
                localeCode: "en",
                permalink: "/blog/__rendering_minimal/",
                title: "{MINIMAL_TITLE}",
              }}),
            }};
            """
        ),
        encoding="utf-8",
    )


def build_fixtures() -> subprocess.CompletedProcess[str]:
    shutil.rmtree(RICH_OUTPUT_FIXTURE.parent, ignore_errors=True)
    shutil.rmtree(MINIMAL_OUTPUT_FIXTURE.parent, ignore_errors=True)
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
        for fixture in (
            RICH_SOURCE_FIXTURE,
            RICH_DATA_FIXTURE,
            MINIMAL_SOURCE_FIXTURE,
            MINIMAL_DATA_FIXTURE,
        ):
            fixture.unlink(missing_ok=True)


def parse_html(path: Path, failures: list[str]) -> BlogPostRenderingParser | None:
    if not path.is_file():
        failures.append(f"missing built blog post fixture {path}")
        return None

    parser = BlogPostRenderingParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def anchors_for(parser: BlogPostRenderingParser, href: str) -> list[AnchorRecord]:
    return [anchor for anchor in parser.anchors if anchor.href == href]


def assert_equal(actual: object, expected: object, context: str, failures: list[str]) -> None:
    if actual != expected:
        failures.append(f"{context}: expected {expected!r}, found {actual!r}")


def assert_single(records: list[object], context: str, failures: list[str]) -> object | None:
    if len(records) != 1:
        failures.append(f"{context}: expected exactly one, found {len(records)}")
        return None
    return records[0]


def assert_external_anchor(anchor: AnchorRecord, context: str, failures: list[str]) -> None:
    classes = class_tokens(anchor.attrs)
    if anchor.marker_count != 1:
        failures.append(f"{context}: expected one external marker, found {anchor.marker_count}")
    if anchor.hidden_text != ["External link"]:
        failures.append(f"{context}: expected hidden External link text, found {anchor.hidden_text!r}")
    if "external-link" not in classes:
        failures.append(f"{context}: missing external-link class")
    if "data-external-link" not in anchor.attrs:
        failures.append(f"{context}: missing data-external-link hook")
    if "target" in anchor.attrs:
        failures.append(f"{context}: current renderer must not add target attributes")


def assert_internal_anchor(anchor: AnchorRecord, context: str, failures: list[str]) -> None:
    classes = class_tokens(anchor.attrs)
    if anchor.marker_count:
        failures.append(f"{context}: internal link received external marker")
    if anchor.hidden_text:
        failures.append(f"{context}: internal link received hidden external text {anchor.hidden_text!r}")
    if "external-link" in classes:
        failures.append(f"{context}: internal link received external-link class")
    if "data-external-link" in anchor.attrs:
        failures.append(f"{context}: internal link received data-external-link hook")


def assert_common_article_shell(
    parser: BlogPostRenderingParser,
    label: str,
    failures: list[str],
) -> None:
    assert_single(parser.article_headers, f"{label}: article header", failures)
    shell = assert_single(parser.article_shells, f"{label}: article shell", failures)
    assert_single(parser.article_contents, f"{label}: article content", failures)
    if isinstance(shell, dict):
        if "data-docs-sidebar-empty" not in shell:
            failures.append(f"{label}: article shell should expose the current empty-sidebar marker")
        assert_equal(
            shell.get("data-docs-sidebar-state"),
            "closed",
            f"{label}: empty article sidebar state",
            failures,
        )


def assert_no_date_or_category_metadata(
    parser: BlogPostRenderingParser,
    label: str,
    failures: list[str],
) -> None:
    if parser.time_records:
        failures.append(f"{label}: current blog article layout should not render date/time metadata")
    if parser.category_badges:
        failures.append(f"{label}: current blog article layout should not render category badges")


def assert_rich_fixture(parser: BlogPostRenderingParser, failures: list[str]) -> None:
    assert_equal(parser.document_title.text, RICH_TITLE, "rich fixture document title", failures)
    assert_equal(parser.meta_descriptions, [RICH_DESCRIPTION], "rich fixture meta description", failures)
    assert_common_article_shell(parser, "rich fixture", failures)

    h1 = assert_single(parser.header_h1s, "rich fixture article title", failures)
    if isinstance(h1, TextRecord):
        assert_equal(h1.text, RICH_ARTICLE_TITLE, "rich fixture visible article title", failures)
        assert_equal(h1.attrs.get("id"), "page-title", "rich fixture article title id", failures)

    eyebrow = assert_single(parser.eyebrows, "rich fixture article eyebrow", failures)
    if isinstance(eyebrow, TextRecord):
        assert_equal(eyebrow.text, "Blog", "rich fixture eyebrow text", failures)

    reading_time = assert_single(parser.reading_times, "rich fixture reading time", failures)
    if isinstance(reading_time, TextRecord):
        assert_equal(reading_time.text, "1 min read", "rich fixture reading time label", failures)
        assert_equal(
            reading_time.attrs.get("aria-label"),
            "Estimated reading time",
            "rich fixture reading time aria label",
            failures,
        )

    intro = assert_single(parser.intros, "rich fixture article intro", failures)
    if isinstance(intro, TextRecord):
        assert_equal(intro.text, RICH_INTRO, "rich fixture intro text", failures)

    assert_no_date_or_category_metadata(parser, "rich fixture", failures)

    content_text = normalize_text("".join(parser.content_text))
    for needle in (
        "Opening paragraph with strong text and inline code.",
        "Closing paragraph after the image and code block.",
    ):
        if needle not in content_text:
            failures.append(f"rich fixture content missing visible body text {needle!r}")

    heading = assert_single(parser.content_headings, "rich fixture Markdown heading", failures)
    if isinstance(heading, TextRecord):
        assert_equal(heading.attrs.get("tag"), "h2", "rich fixture heading level", failures)
        assert_equal(heading.text, "Rendered body heading", "rich fixture heading text", failures)
        if heading.attrs.get("id"):
            failures.append("rich fixture Markdown heading should not receive an automatic id")
        if "heading-anchor-target" in class_tokens(heading.attrs):
            failures.append("rich fixture Markdown heading should not receive an automatic heading-anchor class")

    internal = assert_single(
        anchors_for(parser, "/architecture.html"),
        "rich fixture Markdown internal link",
        failures,
    )
    if isinstance(internal, AnchorRecord):
        assert_internal_anchor(internal, "rich fixture Markdown internal link", failures)

    external = assert_single(
        anchors_for(parser, "https://example.com/blog-rendering"),
        "rich fixture Markdown external link",
        failures,
    )
    if isinstance(external, AnchorRecord):
        assert_external_anchor(external, "rich fixture Markdown external link", failures)

    image = assert_single(parser.content_images, "rich fixture Markdown image", failures)
    if isinstance(image, dict):
        assert_equal(
            image.get("src"),
            "/assets/img/homepage-hero-illustration.svg",
            "rich fixture image src",
            failures,
        )
        assert_equal(
            image.get("alt"),
            "Homepage hero illustration",
            "rich fixture image alt text",
            failures,
        )

    block = assert_single(parser.code_blocks, "rich fixture code block", failures)
    if isinstance(block, CodeBlockRecord):
        assert_equal(block.button_count, 1, "rich fixture code copy button count", failures)
        assert_equal(block.disabled_buttons, 1, "rich fixture code copy disabled button count", failures)
        assert_equal(block.hidden_buttons, 1, "rich fixture code copy hidden button count", failures)
        assert_equal(block.status_count, 1, "rich fixture code copy status count", failures)
        assert_equal("".join(block.button_text).strip(), "Copy", "rich fixture code copy button text", failures)
        assert_equal("".join(block.status_text).strip(), "", "rich fixture code copy status text", failures)
        assert_equal("".join(block.code_text), RICH_CODE, "rich fixture rendered code text", failures)
        assert_equal(
            block.attrs.get("data-code-block-copy-text"),
            RICH_CODE,
            "rich fixture code copy source text",
            failures,
        )
        assert_equal(
            block.attrs.get("data-code-block-copy-language"),
            "js",
            "rich fixture code copy language",
            failures,
        )
        assert_equal(block.attrs.get("data-code-block-copy-info"), "js", "rich fixture code copy info", failures)
        assert_equal(block.attrs.get("data-code-block-copy-kind"), "fence", "rich fixture code copy kind", failures)


def assert_minimal_fixture(parser: BlogPostRenderingParser, failures: list[str]) -> None:
    assert_equal(parser.document_title.text, MINIMAL_TITLE, "minimal fixture document title", failures)
    assert_equal(parser.meta_descriptions, [MINIMAL_DESCRIPTION], "minimal fixture meta description", failures)
    assert_common_article_shell(parser, "minimal fixture", failures)

    h1 = assert_single(parser.header_h1s, "minimal fixture article title", failures)
    if isinstance(h1, TextRecord):
        assert_equal(h1.text, MINIMAL_TITLE, "minimal fixture fallback visible title", failures)
        assert_equal(h1.attrs.get("id"), "page-title", "minimal fixture article title id", failures)

    if parser.eyebrows:
        failures.append("minimal fixture should omit the optional article eyebrow")
    if parser.intros:
        failures.append("minimal fixture should omit the optional article intro")

    reading_time = assert_single(parser.reading_times, "minimal fixture reading time", failures)
    if isinstance(reading_time, TextRecord):
        assert_equal(reading_time.text, "1 min read", "minimal fixture reading time label", failures)

    assert_no_date_or_category_metadata(parser, "minimal fixture", failures)

    content_text = normalize_text("".join(parser.content_text))
    if "Minimal body copy only." not in content_text:
        failures.append("minimal fixture content missing body copy")
    if parser.content_headings:
        failures.append("minimal fixture should not synthesize headings")
    if parser.content_images:
        failures.append("minimal fixture should not synthesize images")
    if parser.code_blocks:
        failures.append("minimal fixture should not synthesize code-block copy wrappers")


def main() -> int:
    failures: list[str] = []
    result = build_fixtures()
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="")
        return result.returncode

    rich = parse_html(RICH_OUTPUT_FIXTURE, failures)
    if rich:
        assert_rich_fixture(rich, failures)

    minimal = parse_html(MINIMAL_OUTPUT_FIXTURE, failures)
    if minimal:
        assert_minimal_fixture(minimal, failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail BLOG_POST_RENDERING {failure}")
        return 1

    print("fkst-website dept=site tag=ok BLOG_POST_RENDERING fixtures=2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
