#!/usr/bin/env python3
"""Smoke-check typed blog indexes and legacy frontmatter posts against the post contract."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
SOURCE_FIXTURE = SITE_DIR / "src" / "__post_contract_smoke.md"
OUTPUT_FIXTURE = SITE_DIR / "_site" / "blog" / "__post_contract_smoke" / "index.html"
BLOG_INDEX_OUTPUTS = (
    (
        "English blog index",
        SITE_DIR / "_site" / "blog.html",
        [
            {
                "category": "News",
                "date": "July 5, 2026",
                "datetime": "2026-07-05",
                "summary": (
                    "The site now separates pipeline announcements, releases, and deeper "
                    "implementation notes so readers can scan update types quickly."
                ),
                "title": "Project news now has a clearer index surface",
            },
            {
                "category": "Release",
                "date": "July 5, 2026",
                "datetime": "2026-07-05",
                "summary": (
                    "The website repository keeps its hand-authored site source separate "
                    "from website-domain Lua packages while CI validates both surfaces."
                ),
                "title": "Website package updates continue through fkst",
            },
            {
                "category": "Deep dive",
                "date": "July 5, 2026",
                "datetime": "2026-07-05",
                "summary": (
                    "Cross-repo composition remains explicit: packages integrate through "
                    "qualified queues and pinned package roots instead of private imports."
                ),
                "title": "Why the package boundary stays queue-only",
            },
        ],
    ),
    (
        "Chinese blog index",
        SITE_DIR / "_site" / "zh" / "blog.html",
        [
            {
                "category": "News",
                "date": "2026-07-05",
                "datetime": "2026-07-05",
                "summary": "站点现在区分流水线公告、发布记录和更深入的实现说明，让读者更快判断更新类型。",
                "title": "项目新闻现在有了更清晰的索引表面",
            },
            {
                "category": "Release",
                "date": "2026-07-05",
                "datetime": "2026-07-05",
                "summary": (
                    "website 仓库继续把手写站点源码与 website 域 Lua package 分开，"
                    "并由 CI 同时验证两类表面。"
                ),
                "title": "Website package 持续通过 fkst 更新",
            },
            {
                "category": "Deep dive",
                "date": "2026-07-05",
                "datetime": "2026-07-05",
                "summary": (
                    "跨仓组合保持显式：package 通过限定名 queue 与 pinned package root "
                    "集成，而不是通过 private import。"
                ),
                "title": "为什么 package 边界保持 queue-only",
            },
        ],
    ),
)


def normalize_text(value: str) -> str:
    return " ".join(value.split())


class BlogSummaryRecord:
    def __init__(self, attrs: dict[str, str]) -> None:
        self.attrs = attrs
        self.categories: list[str] = []
        self.date_text: list[str] = []
        self.datetime = ""
        self.summary_text: list[str] = []
        self.title_text: list[str] = []

    @property
    def category(self) -> str:
        return "".join(self.categories).strip()

    @property
    def date(self) -> str:
        return normalize_text("".join(self.date_text))

    @property
    def summary(self) -> str:
        return normalize_text("".join(self.summary_text))

    @property
    def title(self) -> str:
        return normalize_text("".join(self.title_text))


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
        self.summaries: list[BlogSummaryRecord] = []
        self._in_heading = False
        self._in_intro = False
        self._in_body = False
        self._summary_stack: list[BlogSummaryRecord] = []
        self._summary_capture: str | None = None
        self._summary_span_stack: list[bool] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        classes = set((attr.get("class") or "").split())
        if tag == "article" and "blog-post-summary" in classes:
            record = BlogSummaryRecord(attr)
            self.summaries.append(record)
            self._summary_stack.append(record)
            return
        if tag == "div" and "data-article-shell" in attr:
            self.article_shell_count += 1
        if tag == "div" and "data-article-scroll-content" in attr:
            self.article_content_count += 1
        if tag == "div" and "data-post-contract" in attr:
            self.post_contract = attr.get("data-post-contract", "")
            self.post_source_format = attr.get("data-post-source-format", "")
        if tag == "h1" and attr.get("id") == "page-title":
            self._in_heading = True
        if self._summary_stack and tag == "h3":
            self._summary_capture = "title"
        if tag == "p" and attr.get("class") == "page-intro":
            self._in_intro = True
        if self._summary_stack and tag == "p":
            self._summary_capture = "summary"
        if tag == "p" and "data-post-contract-smoke" in attr:
            self._in_body = True
        if self._summary_stack and tag == "time":
            self._summary_stack[-1].datetime = attr.get("datetime", "")
            self._summary_capture = "date"
        if self._summary_stack and tag == "span":
            is_category_label = "blog-category-badge-label" in classes
            self._summary_span_stack.append(is_category_label)
            if is_category_label:
                self._summary_capture = "category"

    def handle_endtag(self, tag: str) -> None:
        if tag == "article" and self._summary_stack:
            self._summary_stack.pop()
        if tag == "h1":
            self._in_heading = False
        if tag == "h3" and self._summary_capture == "title":
            self._summary_capture = None
        if tag == "p":
            self._in_intro = False
            self._in_body = False
            if self._summary_capture == "summary":
                self._summary_capture = None
        if tag == "time" and self._summary_capture == "date":
            self._summary_capture = None
        if tag == "span" and self._summary_span_stack:
            is_category_label = self._summary_span_stack.pop()
            if is_category_label and self._summary_capture == "category":
                self._summary_capture = None

    def handle_data(self, data: str) -> None:
        if self._in_heading:
            self.heading_text.append(data)
        if self._in_intro:
            self.intro_text.append(data)
        if self._in_body:
            self.body_text.append(data)
        if self._summary_stack and self._summary_capture:
            record = self._summary_stack[-1]
            if self._summary_capture == "category":
                record.categories.append(data)
            elif self._summary_capture == "date":
                record.date_text.append(data)
            elif self._summary_capture == "summary":
                record.summary_text.append(data)
            elif self._summary_capture == "title":
                record.title_text.append(data)


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

    for label, path, expected_posts in BLOG_INDEX_OUTPUTS:
        if not path.is_file():
            failures.append(f"missing blog index output {path}")
            continue

        parser = PostContractParser()
        parser.feed(path.read_text(encoding="utf-8"))
        if len(parser.summaries) != len(expected_posts):
            failures.append(
                f"{label}: expected {len(expected_posts)} typed summaries, "
                f"found {len(parser.summaries)}"
            )
            continue

        for index, expected in enumerate(expected_posts):
            summary = parser.summaries[index]
            context = f"{label} summary {index + 1}"
            if summary.attrs.get("data-post-contract") != "post.v1":
                failures.append(
                    f"{context}: expected post.v1 contract marker, "
                    f"found {summary.attrs.get('data-post-contract')!r}"
                )
            if summary.attrs.get("data-post-source-format") != "typed-schema":
                failures.append(
                    f"{context}: expected typed-schema source marker, "
                    f"found {summary.attrs.get('data-post-source-format')!r}"
                )
            for field in ("category", "date", "datetime", "summary", "title"):
                actual = getattr(summary, field)
                if actual != expected[field]:
                    failures.append(
                        f"{context}: expected {field} {expected[field]!r}, found {actual!r}"
                    )

    if failures:
        print("FAIL posts_contract")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("OK posts_contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
