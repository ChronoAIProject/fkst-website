#!/usr/bin/env python3
"""Smoke-check the article scroll-progress scaffold and reuse audit."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
STYLE_OUTPUT = SITE_DIR / "assets" / "css" / "style.css"
FOUNDATION_SHA = "685dae7e4be4b262de8b3fc6310ec132072370e9"
TARGET_SHA = "ce9d3cb2b5bb10791d767cdd6eedadc1fb0e6947"
RECURRENCE_PATHS = (
    "site",
    "scripts",
    ".fkst/local-packages",
    ".fkst/local-libraries",
)
RECURRENCE_PATTERN = (
    r"reading[-_ ]?progress|scroll[-_ ]?progress|article[-_ ]?progress|"
    r"progressbar|data-(article-scroll|reading)-progress"
)
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
        self.progress_attrs: list[dict[str, str | None]] = []
        self.bar_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if "data-article-scroll-progress" in attr:
            self.progress_attrs.append(attr)
        if tag == "span" and "data-article-scroll-progress-bar" in attr:
            self.bar_count += 1


def output_path(route: str) -> Path:
    if route.endswith("/"):
        return SITE_DIR / route.lstrip("/") / "index.html"
    return SITE_DIR / route.lstrip("/")


def compact(text: str) -> str:
    return " ".join(text.split())


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(ROOT), *args],
        check=False,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def recurrence_audit_failures() -> list[str]:
    failures: list[str] = []
    for sha, label in ((FOUNDATION_SHA, "#82 foundation"), (TARGET_SHA, "target")):
        result = git("rev-parse", "--verify", f"{sha}^{{commit}}")
        if result.returncode != 0:
            failures.append(f"{label}: missing reviewable commit {sha}")

    if failures:
        return failures

    ancestor = git("merge-base", "--is-ancestor", FOUNDATION_SHA, TARGET_SHA)
    if ancestor.returncode != 0:
        failures.append(f"#82 foundation {FOUNDATION_SHA} is not present in target {TARGET_SHA}")

    for sha, label in ((FOUNDATION_SHA, "#82 foundation"), (TARGET_SHA, "target")):
        grep = git(
            "grep",
            "-n",
            "-i",
            "-E",
            RECURRENCE_PATTERN,
            sha,
            "--",
            *RECURRENCE_PATHS,
        )
        if grep.returncode == 0:
            failures.append(f"{label} {sha} already has article progress reuse surface:\n{grep.stdout}")
        elif grep.returncode != 1:
            failures.append(f"could not audit {label} tree for article progress reuse surface: {grep.stderr.strip()}")

    return failures


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
    if not parser:
        return

    if len(parser.progress_attrs) != 1:
        failures.append(
            f"{route}: expected 1 article scroll-progress scaffold, found {len(parser.progress_attrs)}"
        )
        return

    attr = parser.progress_attrs[0]
    expected = {
        "role": "progressbar",
        "data-article-scroll-progress-value": "0",
        "aria-label": "Article reading progress",
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
        failures.append(f"{route}: missing article-scroll-progress class")
    if parser.bar_count != 1:
        failures.append(f"{route}: expected 1 article scroll-progress bar, found {parser.bar_count}")


def check_non_article_route(route: str, failures: list[str]) -> None:
    parser = parse_route(route, failures)
    if not parser:
        return

    if parser.progress_attrs or parser.bar_count:
        failures.append(f"{route}: non-article page includes article scroll-progress scaffold")


def check_stylesheet(failures: list[str]) -> None:
    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
        return

    style = compact(STYLE_OUTPUT.read_text(encoding="utf-8"))
    for needle in (
        ".article-scroll-progress",
        "position: fixed;",
        "height: 3px;",
        "pointer-events: none;",
        ".article-scroll-progress-bar",
        "width: var(--article-scroll-progress, 0%);",
        ".article-scroll-progress, .back-to-top-button",
    ):
        if needle not in style:
            failures.append(f"stylesheet missing article scroll-progress contract: {needle}")


def main() -> int:
    failures: list[str] = recurrence_audit_failures()
    for route in ARTICLE_ROUTES:
        check_article_route(route, failures)
    for route in NON_ARTICLE_ROUTES:
        check_non_article_route(route, failures)
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
