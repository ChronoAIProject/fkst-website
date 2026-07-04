#!/usr/bin/env python3
"""Smoke-check the markdown code-block copy scaffold."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]


class CodeBlockCopyParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.wrappers = 0
        self.buttons = 0
        self.button_labels: list[str] = []
        self.button_disabled = False
        self.statuses = 0
        self.status_text: list[str] = []
        self.pre_blocks = 0
        self._in_status = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        classes = set((attr.get("class") or "").split())
        if tag == "div" and "data-code-block-copy" in attr and "code-block-copy" in classes:
            self.wrappers += 1
        if tag == "button" and "data-code-block-copy-button" in attr:
            self.buttons += 1
            label = attr.get("aria-label")
            if label:
                self.button_labels.append(label)
            self.button_disabled = "disabled" in attr
        if tag == "span" and "data-code-block-copy-status" in attr:
            self.statuses += 1
            self._in_status = True
        if tag == "pre":
            self.pre_blocks += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "span" and self._in_status:
            self._in_status = False

    def handle_data(self, data: str) -> None:
        if self._in_status:
            text = data.strip()
            if text:
                self.status_text.append(text)


def render_markdown_fixture() -> subprocess.CompletedProcess[str]:
    node_script = r"""
const MarkdownIt = require("markdown-it");
const configure = require("./eleventy.config.js");

const markdown = new MarkdownIt();
let amendedMarkdown = false;
const eleventyConfig = {
  addPassthroughCopy() {},
  amendLibrary(name, callback) {
    if (name === "md") {
      amendedMarkdown = true;
      callback(markdown);
    }
  },
};

configure(eleventyConfig);
if (!amendedMarkdown) {
  throw new Error("Eleventy markdown library was not amended");
}

process.stdout.write(markdown.render("```js\nconsole.log('copy scaffold');\n```\n"));
"""
    return subprocess.run(
        ["node", "-e", node_script],
        cwd=ROOT / "site",
        check=False,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def main() -> int:
    result = render_markdown_fixture()
    if result.returncode != 0:
        print(
            "fkst-website dept=site tag=fail CODE_BLOCK_COPY "
            f"renderer-error={result.stderr.strip()}"
        )
        return 1

    parser = CodeBlockCopyParser()
    parser.feed(result.stdout)

    failures: list[str] = []
    if parser.wrappers != 1:
        failures.append(f"expected 1 code-block copy wrapper, found {parser.wrappers}")
    if parser.buttons != 1:
        failures.append(f"expected 1 code-block copy button, found {parser.buttons}")
    if "Copy code" not in parser.button_labels:
        failures.append("missing accessible code-block copy label")
    if not parser.button_disabled:
        failures.append("code-block copy scaffold button must stay disabled until behavior is wired")
    if parser.statuses != 1:
        failures.append(f"expected 1 code-block copy status placeholder, found {parser.statuses}")
    if "Copied" not in parser.status_text:
        failures.append("missing copied confirmation placeholder")
    if parser.pre_blocks != 1:
        failures.append(f"expected 1 rendered pre block, found {parser.pre_blocks}")

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail CODE_BLOCK_COPY {failure}")
        return 1

    print("fkst-website dept=site tag=ok CODE_BLOCK_COPY blocks=1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
