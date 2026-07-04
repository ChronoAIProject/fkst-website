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
SCRIPT_OUTPUT = SITE_DIR / "_site" / "assets" / "js" / "code-block-copy.js"
STYLE_OUTPUT = SITE_DIR / "_site" / "assets" / "css" / "style.css"


class CodeBlockCopyParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.wrapper_count = 0
        self.button_count = 0
        self.disabled_buttons = 0
        self.status_count = 0
        self.script_present = False
        self._in_wrapper = 0
        self._in_button = False
        self._in_status = False
        self._in_code = False
        self.button_text: list[str] = []
        self.status_text: list[str] = []
        self.code_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "div" and "data-code-block-copy" in attr:
            self.wrapper_count += 1
            self._in_wrapper += 1
        if self._in_wrapper and tag == "button" and "data-code-block-copy-button" in attr:
            self.button_count += 1
            self._in_button = True
            if "disabled" in attr:
                self.disabled_buttons += 1
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
            languageSwitch: []
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
    failures: list[str] = []
    result = build_fixture()
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="")
        return result.returncode

    if not OUTPUT_FIXTURE.is_file():
        failures.append(f"missing fixture output {OUTPUT_FIXTURE}")
    else:
        parser = CodeBlockCopyParser()
        parser.feed(OUTPUT_FIXTURE.read_text(encoding="utf-8"))
        if parser.wrapper_count != 2:
            failures.append(f"expected 2 code-block wrappers, found {parser.wrapper_count}")
        if parser.button_count != 2:
            failures.append(f"expected 2 code-block copy buttons, found {parser.button_count}")
        if parser.disabled_buttons:
            failures.append(f"expected built copy buttons to be enabled, found {parser.disabled_buttons} disabled")
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

    if not SCRIPT_OUTPUT.is_file():
        failures.append(f"missing built script asset {SCRIPT_OUTPUT}")
    else:
        script = SCRIPT_OUTPUT.read_text(encoding="utf-8")
        for needle in (
            "navigator.clipboard.writeText",
            'document.execCommand("copy")',
            "[data-code-block-copy-button]",
            "button.disabled = false",
            "Copy failed",
        ):
            if needle not in script:
                failures.append(f"script missing activation contract: {needle}")

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
