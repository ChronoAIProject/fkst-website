#!/usr/bin/env python3
"""Smoke-check legacy frontmatter blog posts against the typed post contract."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
SOURCE_FIXTURE = SITE_DIR / "src" / "__post_contract_smoke.md"
OUTPUT_FIXTURE = SITE_DIR / "_site" / "blog" / "__post_contract_smoke" / "index.html"


class PostContractParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.article_shell_count = 0
        self.article_content_count = 0
        self.post_contract = ""
        self.post_source_format = ""
        self.heading_text: list[str] = []
        self.intro_text: list[str] = []
        self.body_text: list[str] = []
        self._in_heading = False
        self._in_intro = False
        self._in_body = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "div" and "data-article-shell" in attr:
            self.article_shell_count += 1
        if tag == "div" and "data-article-scroll-content" in attr:
            self.article_content_count += 1
        if tag == "div" and "data-post-contract" in attr:
            self.post_contract = attr.get("data-post-contract", "")
            self.post_source_format = attr.get("data-post-source-format", "")
        if tag == "h1" and attr.get("id") == "page-title":
            self._in_heading = True
        if tag == "p" and attr.get("class") == "page-intro":
            self._in_intro = True
        if tag == "p" and "data-post-contract-smoke" in attr:
            self._in_body = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "h1":
            self._in_heading = False
        if tag == "p":
            self._in_intro = False
            self._in_body = False

    def handle_data(self, data: str) -> None:
        if self._in_heading:
            self.heading_text.append(data)
        if self._in_intro:
            self.intro_text.append(data)
        if self._in_body:
            self.body_text.append(data)


def build_fixture() -> subprocess.CompletedProcess[str]:
    SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/article.njk
            permalink: /blog/__post_contract_smoke/
            lang: en
            localeCode: en
            title: Post Contract Smoke | fkst
            description: "Smoke fixture for the legacy frontmatter post contract."
            articleEyebrow: Blog smoke
            articleTitle: Legacy YAML post renders through the typed contract
            articleIntro: "Legacy frontmatter still feeds the article header."
            postCategory: news
            postDate: "2026-07-05"
            brandHref: /
            nav: []
            footerText: Smoke fixture
            ---

            <p data-post-contract-smoke>Legacy post body rendered.</p>
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


def main() -> int:
    result = build_fixture()
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="")
        return result.returncode

    failures: list[str] = []
    if not OUTPUT_FIXTURE.is_file():
        failures.append(f"missing fixture output {OUTPUT_FIXTURE}")
    else:
        parser = PostContractParser()
        parser.feed(OUTPUT_FIXTURE.read_text(encoding="utf-8"))
        if parser.article_shell_count != 1 or parser.article_content_count != 1:
            failures.append("legacy frontmatter post did not render through the article layout")
        if parser.post_contract != "post.v1":
            failures.append(f"expected post.v1 contract marker, found {parser.post_contract!r}")
        if parser.post_source_format != "frontmatter-yaml":
            failures.append(
                f"expected frontmatter-yaml source marker, found {parser.post_source_format!r}"
            )
        if "".join(parser.heading_text).strip() != "Legacy YAML post renders through the typed contract":
            failures.append("legacy frontmatter articleTitle did not render in the article header")
        if "".join(parser.intro_text).strip() != "Legacy frontmatter still feeds the article header.":
            failures.append("legacy frontmatter articleIntro did not render in the article header")
        if "".join(parser.body_text).strip() != "Legacy post body rendered.":
            failures.append("legacy frontmatter post body did not render")

    if failures:
        print("FAIL posts_contract")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("OK posts_contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
