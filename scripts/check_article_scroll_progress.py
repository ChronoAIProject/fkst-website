#!/usr/bin/env python3
"""Check rendered article scroll-progress markup and assets."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
STYLE_OUTPUT = SITE_DIR / "assets" / "css" / "style.css"
SCRIPT_SOURCE = ROOT / "site" / "src" / "assets" / "js" / "article-scroll-progress.js"
SCRIPT_OUTPUT = SITE_DIR / "assets" / "js" / "article-scroll-progress.js"
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


class ArticleScrollProgressParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.html_lang = ""
        self.progress_attrs: list[dict[str, str | None]] = []
        self.bar_count = 0
        self.script_attrs: list[dict[str, str | None]] = []
        self.content_hook_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "html":
            self.html_lang = attr.get("lang", "") or ""
        if "data-article-scroll-progress" in attr:
            self.progress_attrs.append(attr)
        if "article-scroll-progress-bar" in set((attr.get("class") or "").split()):
            self.bar_count += 1
        if tag == "script" and "data-article-scroll-progress-script" in attr:
            self.script_attrs.append(attr)
        if "data-article-scroll-content" in attr:
            self.content_hook_count += 1


def output_path(route: str) -> Path:
    if route.endswith("/"):
        return SITE_DIR / route.lstrip("/") / "index.html"
    return SITE_DIR / route.lstrip("/")


def compact(text: str) -> str:
    return " ".join(text.split())


def parse_route(route: str, failures: list[str]) -> ArticleScrollProgressParser | None:
    path = output_path(route)
    if not path.is_file():
        failures.append(f"{route}: missing built file {path}")
        return None

    parser = ArticleScrollProgressParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def check_article_route(route: str, failures: list[str]) -> None:
    parser = parse_route(route, failures)
    if parser is None:
        return

    if len(parser.progress_attrs) != 1:
        failures.append(f"{route}: expected 1 article progressbar, found {len(parser.progress_attrs)}")
        return

    attr = parser.progress_attrs[0]
    expected = {
        "role": "progressbar",
        "data-article-scroll-progress-value": "0",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": "0",
        "style": "--article-scroll-progress: 0%;",
    }
    for key, value in expected.items():
        if attr.get(key) != value:
            failures.append(f"{route}: expected {key}={value!r}, found {attr.get(key)!r}")

    classes = set((attr.get("class") or "").split())
    if "article-scroll-progress" not in classes:
        failures.append(f"{route}: progressbar missing article-scroll-progress class")

    expected_label = "文章阅读进度" if parser.html_lang == "zh-Hans" else "Article reading progress"
    if attr.get("aria-label") != expected_label:
        failures.append(f"{route}: expected aria-label={expected_label!r}, found {attr.get('aria-label')!r}")

    if parser.bar_count != 1:
        failures.append(f"{route}: expected 1 inner article scroll-progress bar, found {parser.bar_count}")
    if len(parser.script_attrs) != 1:
        failures.append(f"{route}: expected 1 article scroll-progress script, found {len(parser.script_attrs)}")
    else:
        script_src = parser.script_attrs[0].get("src") or ""
        if not script_src.endswith("/assets/js/article-scroll-progress.js"):
            failures.append(f"{route}: unexpected article scroll-progress script src {script_src!r}")
        if "defer" not in parser.script_attrs[0]:
            failures.append(f"{route}: article scroll-progress script must be deferred")
    if parser.content_hook_count != 1:
        failures.append(f"{route}: expected 1 readable-content hook, found {parser.content_hook_count}")


def check_non_article_route(route: str, failures: list[str]) -> None:
    parser = parse_route(route, failures)
    if parser is None:
        return

    if parser.progress_attrs:
        failures.append(f"{route}: non-article page rendered article scroll-progress UI")
    if parser.bar_count:
        failures.append(f"{route}: non-article page rendered article scroll-progress inner bar")
    if parser.script_attrs:
        failures.append(f"{route}: non-article page included article scroll-progress script")
    if parser.content_hook_count:
        failures.append(f"{route}: non-article page rendered readable-content hook")


def check_script_asset(failures: list[str]) -> None:
    if not SCRIPT_SOURCE.is_file():
        failures.append(f"missing source script {SCRIPT_SOURCE}")
        return
    if not SCRIPT_OUTPUT.is_file():
        failures.append(f"missing built script asset {SCRIPT_OUTPUT}")
        return

    source = SCRIPT_SOURCE.read_text(encoding="utf-8")
    output = SCRIPT_OUTPUT.read_text(encoding="utf-8")
    if output != source:
        failures.append("built article scroll-progress script differs from source asset")

    for needle in (
        "[data-article-scroll-progress]",
        "[data-article-scroll-content]",
        "data-article-scroll-progress-value",
        "aria-valuenow",
        "--article-scroll-progress",
        "requestAnimationFrame",
        "setTimeout",
        'addEventListener("scroll"',
        'addEventListener("resize"',
        'addEventListener("pageshow"',
        "{ passive: true }",
    ):
        if needle not in source:
            failures.append(f"source script missing behavior contract: {needle}")


def check_stylesheet(failures: list[str]) -> None:
    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
        return

    style = compact(STYLE_OUTPUT.read_text(encoding="utf-8"))
    for needle in (
        ".article-scroll-progress",
        "position: fixed;",
        "pointer-events: none;",
        ".article-scroll-progress-bar",
        "width: var(--article-scroll-progress, 0%);",
        "@media print",
        ".site-header, .site-footer, .article-scroll-progress, .back-to-top-button",
    ):
        if needle not in style:
            failures.append(f"stylesheet missing article scroll-progress contract: {needle}")


def main() -> int:
    failures: list[str] = []
    for route in ARTICLE_ROUTES:
        check_article_route(route, failures)
    for route in NON_ARTICLE_ROUTES:
        check_non_article_route(route, failures)
    check_script_asset(failures)
    check_stylesheet(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail ARTICLE_SCROLL_PROGRESS {failure}")
        return 1

    print(
        "fkst-website dept=site tag=ok ARTICLE_SCROLL_PROGRESS "
        f"articles={len(ARTICLE_ROUTES)} non_articles={len(NON_ARTICLE_ROUTES)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
