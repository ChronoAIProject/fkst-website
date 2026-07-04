#!/usr/bin/env python3
"""Smoke-check the markdown code-block copy scaffold."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
ISSUE_81_REF = (
    "devloop/issue/ChronoAIProject/fkst-website/81/"
    "ready-consensus-github-devloop-issue-ChronoAIProject-fkst-website-81-"
    "2026-07-03T18-49-27Z-replay-loop-1-2821807451"
)
ISSUE_81_COMMIT = "685dae7e4be4b262de8b3fc6310ec132072370e9"
COPY_FOUNDATION_PATTERNS = (
    "clipboard",
    "code-block copy",
    "code-block-copy",
    "code block copy",
    "data-code-block-copy",
    "copy code",
    "navigator[.]clipboard",
    "writetext",
)


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


def run_git(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=check,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def verify_issue_81_copy_foundation_absent() -> list[str]:
    failures: list[str] = []

    ref_result = run_git(["rev-parse", ISSUE_81_REF], check=False)
    if ref_result.returncode != 0:
        failures.append(f"missing local #81 ref: {ISSUE_81_REF}")
        return failures

    resolved = ref_result.stdout.strip()
    if resolved != ISSUE_81_COMMIT:
        failures.append(
            f"#81 ref resolved to {resolved or '<empty>'}, expected {ISSUE_81_COMMIT}"
        )

    changed_result = run_git(
        ["diff", "--name-only", f"{ISSUE_81_COMMIT}^", ISSUE_81_COMMIT, "--"],
        check=False,
    )
    if changed_result.returncode != 0:
        failures.append(
            "#81 commit diff is unavailable: " f"{changed_result.stderr.strip()}"
        )
    else:
        changed_paths = {
            path for path in changed_result.stdout.splitlines() if path.strip()
        }
        if changed_paths != {"fkst.lock"}:
            failures.append(
                "#81 commit changed unexpected files: "
                f"{', '.join(sorted(changed_paths)) or '<none>'}"
            )

    grep_result = run_git(
        [
            "grep",
            "-n",
            "-i",
            "-E",
            "|".join(COPY_FOUNDATION_PATTERNS),
            ISSUE_81_COMMIT,
            "--",
            "site",
            "scripts",
            ".fkst",
        ],
        check=False,
    )
    if grep_result.returncode == 0:
        failures.append(
            "#81 tree already contains copy foundation evidence: "
            f"{grep_result.stdout.splitlines()[0]}"
        )
    elif grep_result.returncode != 1:
        failures.append(
            "#81 tree copy foundation scan failed: " f"{grep_result.stderr.strip()}"
        )

    current_grep_result = run_git(
        [
            "grep",
            "-n",
            "-i",
            "-E",
            "|".join(COPY_FOUNDATION_PATTERNS),
            "--",
            "site",
            "scripts",
            ".fkst",
        ],
        check=False,
    )
    if current_grep_result.returncode != 0:
        failures.append(
            "current tree has no code-block copy scaffold evidence: "
            f"{current_grep_result.stderr.strip()}"
        )
    elif "site/lib/codeBlockCopy.js" not in current_grep_result.stdout:
        failures.append("current tree does not bind the scaffold to site/lib/codeBlockCopy.js")

    return failures


def main() -> int:
    provenance_failures = verify_issue_81_copy_foundation_absent()
    if provenance_failures:
        for failure in provenance_failures:
            print(f"fkst-website dept=site tag=fail CODE_BLOCK_COPY {failure}")
        return 1

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
