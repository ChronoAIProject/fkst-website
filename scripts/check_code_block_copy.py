#!/usr/bin/env python3
"""Smoke-check rendered code-block copy controls."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
SOURCE_FIXTURE = SITE_DIR / "src" / "__code_block_copy_smoke.md"
OUTPUT_FIXTURE = SITE_DIR / "_site" / "__code_block_copy_smoke" / "index.html"
BLOG_SOURCE_FIXTURE = SITE_DIR / "src" / "__blog_code_block_copy_smoke.md"
BLOG_DATA_FIXTURE = SITE_DIR / "src" / "__blog_code_block_copy_smoke.11tydata.js"
BLOG_OUTPUT_FIXTURE = SITE_DIR / "_site" / "blog" / "__code_block_copy_smoke" / "index.html"
SCRIPT_OUTPUT = SITE_DIR / "_site" / "assets" / "js" / "code-block-copy.js"
STYLE_OUTPUT = SITE_DIR / "_site" / "assets" / "css" / "style.css"


class CodeBlockCopyParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.wrapper_count = 0
        self.button_count = 0
        self.disabled_buttons = 0
        self.hidden_buttons = 0
        self.status_count = 0
        self.script_present = False
        self.article_shell_count = 0
        self.article_content_count = 0
        self._in_wrapper = 0
        self._in_button = False
        self._in_status = False
        self._in_code = False
        self.wrapper_text: list[str] = []
        self.wrapper_language: list[str] = []
        self.wrapper_info: list[str] = []
        self.wrapper_kind: list[str] = []
        self.button_text: list[str] = []
        self.status_text: list[str] = []
        self.code_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "div" and "data-code-block-copy" in attr:
            self.wrapper_count += 1
            self._in_wrapper += 1
            self.wrapper_text.append(attr.get("data-code-block-copy-text", ""))
            self.wrapper_language.append(attr.get("data-code-block-copy-language", ""))
            self.wrapper_info.append(attr.get("data-code-block-copy-info", ""))
            self.wrapper_kind.append(attr.get("data-code-block-copy-kind", ""))
        if tag == "div" and "data-article-shell" in attr:
            self.article_shell_count += 1
        if tag == "div" and "data-article-scroll-content" in attr:
            self.article_content_count += 1
        if self._in_wrapper and tag == "button" and "data-code-block-copy-button" in attr:
            self.button_count += 1
            self._in_button = True
            if "disabled" in attr:
                self.disabled_buttons += 1
            if "hidden" in attr:
                self.hidden_buttons += 1
        if self._in_wrapper and tag == "span" and "data-code-block-copy-status" in attr:
            self.status_count += 1
            self._in_status = True
        if self._in_wrapper and tag == "code":
            self._in_code = True
        if tag == "script" and "data-code-block-copy-script" in attr:
            self.script_present = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "button":
            self._in_button = False
        if tag == "span":
            self._in_status = False
        if tag == "code":
            self._in_code = False
        if tag == "div" and self._in_wrapper:
            self._in_wrapper -= 1

    def handle_data(self, data: str) -> None:
        if self._in_button:
            self.button_text.append(data)
        if self._in_status:
            self.status_text.append(data)
        if self._in_code:
            self.code_text.append(data)


def build_fixture() -> subprocess.CompletedProcess[str]:
    SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/page.njk
            permalink: /__code_block_copy_smoke/
            lang: en
            title: Code Block Copy Smoke | fkst
            description: "Smoke fixture for code-block copy controls."
            brandHref: /
            nav: []
            footerText: Smoke fixture
            ---

            ```sh
            printf 'fenced'
            ```

                printf 'indented'
            """
        ),
        encoding="utf-8",
    )
    BLOG_SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/article.njk
            permalink: /blog/__code_block_copy_smoke/
            brandHref: /
            nav: []
            footerText: Smoke fixture
            ---

            The snippet below exercises the article/blog rendering path.

            ```js
            const html = "<button>Copy</button>";
            console.log("blog copy scaffold & exact");
            ```
            """
        ),
        encoding="utf-8",
    )
    BLOG_DATA_FIXTURE.write_text(
        textwrap.dedent(
            """\
            "use strict";

            const { parseTypedPost } = require("../lib/posts");

            module.exports = {
              lang: "en",
              localeCode: "en",
              title: "Blog Code Block Copy Smoke | fkst",
              description: "Smoke fixture for blog code snippet copy controls.",
              post: parseTypedPost({
                articleEyebrow: "Blog smoke",
                articleIntro: "Fixture article for blog code snippet copy controls.",
                articleTitle: "Blog snippet copy scaffold",
                category: { slug: "news" },
                description: "Smoke fixture for blog code snippet copy controls.",
                lang: "en",
                localeCode: "en",
                permalink: "/blog/__code_block_copy_smoke/",
                title: "Blog Code Block Copy Smoke | fkst",
              }),
            };
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
        BLOG_SOURCE_FIXTURE.unlink(missing_ok=True)
        BLOG_DATA_FIXTURE.unlink(missing_ok=True)


def parse_output(path: Path, failures: list[str]) -> CodeBlockCopyParser | None:
    if not path.is_file():
        failures.append(f"missing fixture output {path}")
        return None
    parser = CodeBlockCopyParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def main() -> int:
    failures: list[str] = []
    result = build_fixture()
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="")
        return result.returncode

    parser = parse_output(OUTPUT_FIXTURE, failures)
    if parser:
        if parser.wrapper_count != 2:
            failures.append(f"expected 2 code-block wrappers, found {parser.wrapper_count}")
        if parser.button_count != 2:
            failures.append(f"expected 2 code-block copy buttons, found {parser.button_count}")
        if parser.disabled_buttons != 2:
            failures.append(f"expected 2 inert server-rendered copy buttons, found {parser.disabled_buttons}")
        if parser.hidden_buttons != 2:
            failures.append(f"expected 2 hidden server-rendered copy buttons, found {parser.hidden_buttons}")
        if parser.status_count != 2:
            failures.append(f"expected 2 live status elements, found {parser.status_count}")
        if not parser.script_present:
            failures.append("missing code-block copy activation script")
        if "".join(parser.button_text).strip() != "CopyCopy":
            failures.append("copy button labels are not the idle Copy labels")
        if "".join(parser.status_text).strip():
            failures.append("copy status should be empty before client activation")
        expected_code = "printf 'fenced'\nprintf 'indented'\n"
        if "".join(parser.code_text) != expected_code:
            failures.append("rendered copy source text does not match the code-only contents")
        if parser.wrapper_text != ["printf 'fenced'\n", "printf 'indented'\n"]:
            failures.append("code-block copy source contract does not expose exact code text")
        if parser.wrapper_language != ["sh", ""]:
            failures.append("code-block copy source contract does not expose language metadata")
        if parser.wrapper_info != ["sh", ""]:
            failures.append("code-block copy source contract does not expose info metadata")
        if parser.wrapper_kind != ["fence", "code_block"]:
            failures.append("code-block copy source contract does not expose block kind metadata")

    blog_parser = parse_output(BLOG_OUTPUT_FIXTURE, failures)
    if blog_parser:
        if blog_parser.article_shell_count != 1 or blog_parser.article_content_count != 1:
            failures.append("blog smoke fixture did not render through the article content path")
        if blog_parser.wrapper_count != 1:
            failures.append(f"expected 1 blog code-block wrapper, found {blog_parser.wrapper_count}")
        if blog_parser.button_count != 1:
            failures.append(f"expected 1 blog code-block copy button, found {blog_parser.button_count}")
        if blog_parser.disabled_buttons != 1 or blog_parser.hidden_buttons != 1:
            failures.append("blog copy button scaffold should render inert and hidden before activation")
        if blog_parser.status_count != 1:
            failures.append(f"expected 1 blog live status element, found {blog_parser.status_count}")
        if not blog_parser.script_present:
            failures.append("missing code-block copy activation script on blog smoke fixture")
        if "".join(blog_parser.button_text).strip() != "Copy":
            failures.append("blog copy button label is not the idle Copy label")
        if "".join(blog_parser.status_text).strip():
            failures.append("blog copy status should be empty before client activation")
        expected_blog_code = (
            'const html = "<button>Copy</button>";\n'
            'console.log("blog copy scaffold & exact");\n'
        )
        if "".join(blog_parser.code_text) != expected_blog_code:
            failures.append("blog code block rendered text does not match the snippet contents")
        if blog_parser.wrapper_text != [expected_blog_code]:
            failures.append("blog copy source contract does not expose exact code text")
        if blog_parser.wrapper_language != ["js"]:
            failures.append("blog copy source contract does not expose language metadata")
        if blog_parser.wrapper_info != ["js"]:
            failures.append("blog copy source contract does not expose info metadata")
        if blog_parser.wrapper_kind != ["fence"]:
            failures.append("blog copy source contract does not expose block kind metadata")

    if not SCRIPT_OUTPUT.is_file():
        failures.append(f"missing built script asset {SCRIPT_OUTPUT}")
    else:
        script = SCRIPT_OUTPUT.read_text(encoding="utf-8")
        for needle in (
            "navigator.clipboard.writeText",
            'document.execCommand("copy")',
            'wrapper.getAttribute("data-code-block-copy-text")',
            "[data-code-block-copy-button]",
            "button.hidden = false",
            "Copy failed",
        ):
            if needle not in script:
                failures.append(f"script missing activation contract: {needle}")
        if 'querySelector("pre code")' in script or "textContent || \"\"" in script:
            failures.append("script must use renderer-provided code text instead of DOM code text")

    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
    else:
        style = STYLE_OUTPUT.read_text(encoding="utf-8")
        for needle in (
            ".code-block-copy",
            ".code-block-copy-button",
            "@media (max-width: 760px)",
        ):
            if needle not in style:
                failures.append(f"stylesheet missing code-block copy rule: {needle}")

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail CODE_BLOCK_COPY {failure}")
        return 1

    print("fkst-website dept=site tag=ok CODE_BLOCK_COPY blocks=2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
