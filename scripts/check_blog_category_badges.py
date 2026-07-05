#!/usr/bin/env python3
"""Check rendered blog category badge markup and styling."""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
SOURCE_FIXTURE = SITE_DIR / "src" / "__blog_category_badge_smoke.njk"
OUTPUT_FIXTURE = SITE_DIR / "_site" / "__blog_category_badge_smoke" / "index.html"
BLOG_OUTPUTS = (
    ("English blog index", SITE_DIR / "_site" / "blog.html"),
    ("Chinese blog index", SITE_DIR / "_site" / "zh" / "blog.html"),
)
STYLE_OUTPUT = SITE_DIR / "_site" / "assets" / "css" / "style.css"


@dataclass
class BadgeRecord:
    classes: list[str]
    attrs: dict[str, str]
    labels: list[str] = field(default_factory=list)
    icons: list[dict[str, str]] = field(default_factory=list)

    @property
    def label(self) -> str:
        return "".join(self.labels).strip()


class BlogCategoryBadgeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.badges: list[BadgeRecord] = []
        self._badge_stack: list[BadgeRecord] = []
        self._label_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {name: value or "" for name, value in attrs}
        classes = (attr.get("class") or "").split()
        if tag == "span" and "blog-category-badge" in classes:
            badge = BadgeRecord(classes=classes, attrs=attr)
            self.badges.append(badge)
            self._badge_stack.append(badge)
            return

        if not self._badge_stack:
            return

        if tag == "img" and "blog-category-badge-icon" in classes:
            self._badge_stack[-1].icons.append(attr)
        if tag == "span" and "blog-category-badge-label" in classes:
            self._label_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "span" and self._label_depth:
            self._label_depth -= 1
            return
        if tag == "span" and self._badge_stack:
            self._badge_stack.pop()

    def handle_data(self, data: str) -> None:
        if self._badge_stack and self._label_depth:
            self._badge_stack[-1].labels.append(data)


def build_fixture() -> subprocess.CompletedProcess[str]:
    SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/page.njk
            permalink: /__blog_category_badge_smoke/
            lang: en
            title: Blog Category Badge Smoke | fkst
            description: "Smoke fixture for blog category badges."
            brandHref: /
            nav:
              - label: Home
                href: /
            localeCode: en
            localeAlternates:
              en: /__blog_category_badge_smoke/
            footerText: Blog category badge smoke fixture.
            ---
            {% from "components/BlogCategoryBadge.njk" import blogCategoryBadge %}

            <section class="blog-index" aria-labelledby="blog-smoke-title">
              <h1 id="blog-smoke-title">Blog</h1>
              <article class="blog-post-summary">
                <div class="blog-post-summary-meta">
                  {{ blogCategoryBadge("news") }}
                  <time datetime="2026-07-01">July 1, 2026</time>
                </div>
                <h2>News summary</h2>
              </article>
              <article class="blog-post-summary">
                <div class="blog-post-summary-meta">
                  {{ blogCategoryBadge("release") }}
                  <time datetime="2026-07-02">July 2, 2026</time>
                </div>
                <h2>Release summary</h2>
              </article>
              <article class="blog-post-summary">
                <div class="blog-post-summary-meta">
                  {{ blogCategoryBadge({ slug: "deep-dive", label: "Ignored" }) }}
                  <time datetime="2026-07-03">July 3, 2026</time>
                </div>
                <h2>Deep dive summary</h2>
              </article>
              <article class="blog-post-summary">
                <div class="blog-post-summary-meta">
                  {{ blogCategoryBadge({ slug: "roadmap", label: "Roadmap" }) }}
                  <time datetime="2026-07-04">July 4, 2026</time>
                </div>
                <h2>Unknown category summary</h2>
              </article>
              <article class="blog-post-summary">
                <div class="blog-post-summary-meta">
                  {{ blogCategoryBadge("") }}
                  <time datetime="2026-07-05">July 5, 2026</time>
                </div>
                <h2>Missing category summary</h2>
              </article>
            </section>
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


def parse_html(path: Path, failures: list[str]) -> BlogCategoryBadgeParser | None:
    if not path.is_file():
        failures.append(f"missing built file {path}")
        return None

    parser = BlogCategoryBadgeParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def assert_known_badge(
    badge: BadgeRecord,
    slug: str,
    label: str,
    icon_name: str,
    failures: list[str],
) -> None:
    context = f"{slug} badge"
    if f"blog-category-badge--{slug}" not in badge.classes:
        failures.append(f"{context}: missing category modifier class")
    if badge.label != label:
        failures.append(f"{context}: expected label {label!r}, found {badge.label!r}")
    if len(badge.icons) != 1:
        failures.append(f"{context}: expected one decorative icon, found {len(badge.icons)}")
        return

    icon = badge.icons[0]
    if not icon.get("src", "").endswith(f"/assets/img/blog-category-badges/{icon_name}.svg"):
        failures.append(f"{context}: unexpected icon source {icon.get('src')!r}")
    if icon.get("alt") != "":
        failures.append(f"{context}: decorative icon alt text must be empty")
    if icon.get("aria-hidden") != "true":
        failures.append(f"{context}: decorative icon must be hidden from assistive tech")
    if icon.get("width") != "14" or icon.get("height") != "14":
        failures.append(f"{context}: icon must render at 14 x 14 px")


def assert_badges(parser: BlogCategoryBadgeParser, failures: list[str]) -> None:
    if len(parser.badges) != 4:
        failures.append(f"expected 4 rendered badges, found {len(parser.badges)}")
        return

    assert_known_badge(parser.badges[0], "news", "News", "news", failures)
    assert_known_badge(parser.badges[1], "release", "Release", "release", failures)
    assert_known_badge(parser.badges[2], "deep-dive", "Deep dive", "deep-dive", failures)

    fallback = parser.badges[3]
    if "blog-category-badge--text-only" not in fallback.classes:
        failures.append("unknown category badge should use text-only fallback class")
    if fallback.label != "Roadmap":
        failures.append(f"unknown category badge label should survive, found {fallback.label!r}")
    if fallback.icons:
        failures.append("unknown category badge should not render a broken icon")


def assert_blog_index_badges(
    label: str,
    parser: BlogCategoryBadgeParser,
    failures: list[str],
) -> None:
    if len(parser.badges) != 3:
        failures.append(f"{label}: expected 3 rendered post-summary badges, found {len(parser.badges)}")
        return

    assert_known_badge(parser.badges[0], "news", "News", "news", failures)
    assert_known_badge(parser.badges[1], "release", "Release", "release", failures)
    assert_known_badge(parser.badges[2], "deep-dive", "Deep dive", "deep-dive", failures)


def assert_styles(failures: list[str]) -> None:
    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
        return

    style = STYLE_OUTPUT.read_text(encoding="utf-8")
    for needle in (
        ".blog-category-badge",
        "background: var(--accent-soft);",
        "border-radius: 6px;",
        "gap: 5px;",
        "min-height: 26px;",
        "padding: 5px 8px;",
        "max-width: 100%;",
        "white-space: normal;",
        ".blog-category-badge-icon",
        "height: 14px;",
        "width: 14px;",
        "overflow-wrap: anywhere;",
        ".blog-post-summary-meta",
        "gap: 8px;",
    ):
        if needle not in style:
            failures.append(f"stylesheet missing blog badge contract: {needle}")


def main() -> int:
    failures: list[str] = []
    result = build_fixture()
    if result.returncode != 0:
        failures.append(
            "npm run build failed for blog category badge fixture:\n"
            + result.stdout
            + result.stderr
        )
    else:
        parser = parse_html(OUTPUT_FIXTURE, failures)
        if parser:
            assert_badges(parser, failures)
        for label, path in BLOG_OUTPUTS:
            parser = parse_html(path, failures)
            if parser:
                assert_blog_index_badges(label, parser, failures)
        assert_styles(failures)

    if failures:
        print("FAIL blog_category_badges")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("OK blog_category_badges")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
