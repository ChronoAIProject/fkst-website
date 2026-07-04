#!/usr/bin/env python3
"""Smoke-check article scroll progress rendering and client behavior."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
STYLE_OUTPUT = SITE_DIR / "assets" / "css" / "style.css"
SCRIPT_OUTPUT = SITE_DIR / "assets" / "js" / "article-scroll-progress.js"
ARTICLE_PATHS = (
    "architecture.html",
    "doctrine.html",
    "zh/architecture.html",
    "zh/doctrine.html",
)
NON_ARTICLE_PATHS = ("index.html", "zh/index.html")


class ArticleScrollProgressParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.progress_count = 0
        self.progress_attrs: list[dict[str, str | None]] = []
        self.bar_count = 0
        self.script_count = 0
        self.content_hook_count = 0
        self._in_progress = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "div" and "data-article-scroll-progress" in attr:
            self.progress_count += 1
            self.progress_attrs.append(attr)
            self._in_progress += 1
        elif self._in_progress and tag == "div":
            classes = set((attr.get("class") or "").split())
            if "article-scroll-progress-bar" in classes:
                self.bar_count += 1

        if tag == "script" and "data-article-scroll-progress-script" in attr:
            self.script_count += 1

        if tag == "div" and "data-article-scroll-content" in attr:
            self.content_hook_count += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "div" and self._in_progress:
            self._in_progress -= 1


def output_path(relative_path: str) -> Path:
    return SITE_DIR / relative_path


def compact(text: str) -> str:
    return " ".join(text.split())


def parse_page(relative_path: str, failures: list[str]) -> ArticleScrollProgressParser | None:
    path = output_path(relative_path)
    if not path.is_file():
        failures.append(f"{relative_path}: missing built file {path}")
        return None

    parser = ArticleScrollProgressParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def check_article_page(relative_path: str, failures: list[str]) -> None:
    parser = parse_page(relative_path, failures)
    if parser is None:
        return

    if parser.progress_count != 1:
        failures.append(f"{relative_path}: expected 1 article progressbar, found {parser.progress_count}")
        return

    attr = parser.progress_attrs[0]
    expected_attrs = {
        "role": "progressbar",
        "data-article-scroll-progress-value": "0",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": "0",
    }
    for name, expected in expected_attrs.items():
        if attr.get(name) != expected:
            failures.append(f"{relative_path}: expected {name}={expected!r}, found {attr.get(name)!r}")

    classes = set((attr.get("class") or "").split())
    if "article-scroll-progress" not in classes:
        failures.append(f"{relative_path}: progressbar missing article-scroll-progress class")
    if attr.get("style") != "--article-scroll-progress: 0%;":
        failures.append(f"{relative_path}: progressbar missing initial CSS progress custom property")
    if not attr.get("aria-label"):
        failures.append(f"{relative_path}: progressbar missing accessible label")
    if parser.bar_count != 1:
        failures.append(f"{relative_path}: expected 1 inner progress bar, found {parser.bar_count}")
    if parser.script_count != 1:
        failures.append(f"{relative_path}: expected 1 article progress script, found {parser.script_count}")
    if parser.content_hook_count != 1:
        failures.append(f"{relative_path}: expected 1 readable content hook, found {parser.content_hook_count}")


def check_non_article_page(relative_path: str, failures: list[str]) -> None:
    parser = parse_page(relative_path, failures)
    if parser is None:
        return

    if parser.progress_count:
        failures.append(f"{relative_path}: non-article page rendered article progressbar")
    if parser.script_count:
        failures.append(f"{relative_path}: non-article page initialized article progress script")
    if parser.content_hook_count:
        failures.append(f"{relative_path}: non-article page rendered article content hook")


def check_assets(failures: list[str]) -> None:
    if not SCRIPT_OUTPUT.is_file():
        failures.append(f"missing built script asset {SCRIPT_OUTPUT}")
    else:
        script = SCRIPT_OUTPUT.read_text(encoding="utf-8")
        for needle in (
            "[data-article-scroll-progress]",
            "[data-article-scroll-content]",
            "--article-scroll-progress",
            "data-article-scroll-progress-value",
            "aria-valuenow",
            "requestAnimationFrame",
            'addEventListener("scroll"',
            'addEventListener("resize"',
            'addEventListener("pageshow"',
            "{ passive: true }",
        ):
            if needle not in script:
                failures.append(f"script missing behavior contract: {needle}")

    if not STYLE_OUTPUT.is_file():
        failures.append(f"missing built stylesheet {STYLE_OUTPUT}")
    else:
        style = compact(STYLE_OUTPUT.read_text(encoding="utf-8"))
        for needle in (
            ".article-scroll-progress",
            ".article-scroll-progress-bar",
            "width: var(--article-scroll-progress, 0%);",
            "@media print",
            ".article-scroll-progress, .back-to-top-button",
        ):
            if needle not in style:
                failures.append(f"stylesheet missing article progress rule: {needle}")


def check_behavior(failures: list[str]) -> None:
    if not SCRIPT_OUTPUT.is_file():
        return

    node_script = textwrap.dedent(
        r"""
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const vm = require("node:vm");

        const source = fs.readFileSync(process.argv[1], "utf8");

        function runScenario(config) {
          const listeners = {};
          let scrollY = config.scrollY || 0;
          const progress = {
            attributes: {},
            styleValues: {},
            style: {
              setProperty(name, value) {
                progress.styleValues[name] = value;
              }
            },
            setAttribute(name, value) {
              this.attributes[name] = String(value);
            }
          };
          const documentElement = {
            clientHeight: config.viewportHeight,
            offsetHeight: config.scrollHeight,
            scrollHeight: config.scrollHeight,
            scrollTop: 0
          };
          const body = {
            offsetHeight: config.scrollHeight,
            scrollHeight: config.scrollHeight,
            scrollTop: 0
          };
          const content = {
            getBoundingClientRect() {
              return {
                top: config.contentTop - scrollY,
                bottom: config.contentBottom - scrollY
              };
            }
          };
          const window = {
            innerHeight: config.viewportHeight,
            pageYOffset: 0,
            scrollY,
            requestAnimationFrame(callback) {
              callback();
              return 1;
            },
            setTimeout(callback) {
              callback();
              return 1;
            },
            addEventListener(name, callback, options) {
              listeners[name] = { callback, options };
            }
          };
          const document = {
            body,
            documentElement,
            querySelectorAll(selector) {
              assert.equal(selector, "[data-article-scroll-progress]");
              return config.hasProgress === false ? [] : [progress];
            },
            querySelector(selector) {
              if (selector === "[data-article-scroll-content]" || selector === ".page-content") {
                return content;
              }
              return null;
            }
          };

          vm.runInNewContext(source, { window, document });

          return {
            listeners,
            progress,
            setScroll(value) {
              scrollY = value;
              window.scrollY = value;
            }
          };
        }

        const page = runScenario({
          scrollY: 0,
          viewportHeight: 1000,
          scrollHeight: 3000,
          contentTop: 500,
          contentBottom: 2600
        });
        assert.equal(page.progress.attributes["data-article-scroll-progress-value"], "0");
        assert.equal(page.progress.attributes["aria-valuenow"], "0");
        assert.equal(page.progress.styleValues["--article-scroll-progress"], "0%");
        assert.equal(page.listeners.scroll.options.passive, true);
        assert.equal(typeof page.listeners.resize.callback, "function");
        assert.equal(typeof page.listeners.pageshow.callback, "function");

        page.setScroll(1050);
        page.listeners.scroll.callback();
        assert.equal(page.progress.attributes["data-article-scroll-progress-value"], "50");
        assert.equal(page.progress.attributes["aria-valuenow"], "50");
        assert.equal(page.progress.styleValues["--article-scroll-progress"], "50%");

        page.setScroll(1800);
        page.listeners.resize.callback();
        assert.equal(page.progress.attributes["data-article-scroll-progress-value"], "100");
        assert.equal(page.progress.attributes["aria-valuenow"], "100");
        assert.equal(page.progress.styleValues["--article-scroll-progress"], "100%");

        page.setScroll(-200);
        page.listeners.pageshow.callback();
        assert.equal(page.progress.attributes["data-article-scroll-progress-value"], "0");

        const shortPage = runScenario({
          scrollY: 0,
          viewportHeight: 1000,
          scrollHeight: 600,
          contentTop: 0,
          contentBottom: 600
        });
        assert.equal(shortPage.progress.attributes["data-article-scroll-progress-value"], "100");
        assert.notEqual(shortPage.progress.attributes["aria-valuenow"], "NaN");

        const nonArticle = runScenario({
          hasProgress: false,
          scrollY: 0,
          viewportHeight: 1000,
          scrollHeight: 3000,
          contentTop: 500,
          contentBottom: 2600
        });
        assert.deepEqual(Object.keys(nonArticle.listeners), []);
        """
    )
    result = subprocess.run(
        ["node", "-e", node_script, str(SCRIPT_OUTPUT)],
        cwd=ROOT,
        check=False,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        failures.append(f"client behavior contract failed:\n{result.stdout}{result.stderr}")


def main() -> int:
    failures: list[str] = []
    for relative_path in ARTICLE_PATHS:
        check_article_page(relative_path, failures)
    for relative_path in NON_ARTICLE_PATHS:
        check_non_article_page(relative_path, failures)
    check_assets(failures)
    check_behavior(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail ARTICLE_SCROLL_PROGRESS {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok ARTICLE_SCROLL_PROGRESS pages={len(ARTICLE_PATHS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
