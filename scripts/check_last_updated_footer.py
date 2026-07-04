#!/usr/bin/env python3
"""Smoke-check rendered footer last-updated metadata."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
SOURCE_FIXTURE = SITE_DIR / "src" / "__last_updated_footer_smoke.njk"
OUTPUT_FIXTURE = SITE_DIR / "_site" / "__last_updated_footer_smoke" / "index.html"
HOME_OUTPUT = SITE_DIR / "_site" / "index.html"


class FooterLastUpdatedParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.footer_count = 0
        self.last_updated_count = 0
        self.last_updated_text: list[str] = []
        self.time_datetimes: list[str] = []
        self.time_text: list[str] = []
        self.footer_text: list[str] = []
        self._in_footer = False
        self._in_last_updated = False
        self._in_time = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "footer":
            self.footer_count += 1
            self._in_footer = True
        if self._in_footer and "data-last-updated" in attr:
            self.last_updated_count += 1
            self._in_last_updated = True
        if self._in_last_updated and tag == "time":
            self._in_time = True
            self.time_datetimes.append(attr.get("datetime", ""))

    def handle_endtag(self, tag: str) -> None:
        if tag == "time":
            self._in_time = False
        if tag == "p" and self._in_last_updated:
            self._in_last_updated = False
        if tag == "footer":
            self._in_footer = False

    def handle_data(self, data: str) -> None:
        if not self._in_footer:
            return

        text = data.strip()
        if not text:
            return

        self.footer_text.append(text)
        if self._in_last_updated:
            self.last_updated_text.append(text)
        if self._in_time:
            self.time_text.append(text)


def compact(parts: list[str]) -> str:
    return " ".join(" ".join(parts).split())


def check_utility() -> list[str]:
    script = r"""
const assert = require("node:assert/strict");
const {
  dateOnlyFromValue,
  lastUpdatedMetadata
} = require("./site/src/_includes/utils/last-updated");

assert.equal(dateOnlyFromValue("2026-07-04"), "2026-07-04");
assert.equal(dateOnlyFromValue("2026-02-31"), null);
assert.deepEqual(lastUpdatedMetadata("2026-07-04"), {
  datetime: "2026-07-04",
  label: "July 4, 2026"
});
assert.deepEqual(lastUpdatedMetadata({ date: "2026-07-04", label: "Release note refresh" }), {
  datetime: "2026-07-04",
  label: "Release note refresh"
});
assert.equal(lastUpdatedMetadata("not a date"), null);
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=False,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode == 0:
        return []
    return [f"metadata utility contract failed:\n{result.stdout}{result.stderr}"]


def build_fixture() -> subprocess.CompletedProcess[str]:
    SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/page.njk
            permalink: /__last_updated_footer_smoke/
            lang: en
            title: Last Updated Footer Smoke | fkst
            description: "Smoke fixture for footer last-updated metadata."
            brandHref: /
            nav: []
            languageSwitch: []
            footerText: Smoke fixture
            lastUpdated:
              date: "2026-07-04"
            ---

            <section class="page-content">
              <p>Fixture body.</p>
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


def parse_html(path: Path, failures: list[str]) -> FooterLastUpdatedParser | None:
    if not path.is_file():
        failures.append(f"missing built file {path}")
        return None

    parser = FooterLastUpdatedParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def check_fixture(failures: list[str]) -> None:
    parser = parse_html(OUTPUT_FIXTURE, failures)
    if not parser:
        return

    if parser.footer_count != 1:
        failures.append(f"fixture: expected 1 footer, found {parser.footer_count}")
    if parser.last_updated_count != 1:
        failures.append(
            f"fixture: expected 1 last-updated footer element, found {parser.last_updated_count}"
        )
    if compact(parser.last_updated_text) != "Last updated: July 4, 2026":
        failures.append(
            f"fixture: unexpected last-updated text {compact(parser.last_updated_text)!r}"
        )
    if parser.time_datetimes != ["2026-07-04"]:
        failures.append(f"fixture: unexpected time datetime values {parser.time_datetimes!r}")
    if compact(parser.time_text) != "July 4, 2026":
        failures.append(f"fixture: unexpected time text {compact(parser.time_text)!r}")
    if "Smoke fixture" not in parser.footer_text:
        failures.append("fixture: existing footer text did not render with last-updated metadata")


def check_unset_page(failures: list[str]) -> None:
    parser = parse_html(HOME_OUTPUT, failures)
    if not parser:
        return

    if parser.last_updated_count != 0:
        failures.append("home: last-updated footer rendered without page metadata")
    if "This site is built and maintained by the fkst autonomous pipeline itself." not in parser.footer_text:
        failures.append("home: existing footer text is missing")


def main() -> int:
    failures = check_utility()
    result = build_fixture()
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="")
        return result.returncode

    check_fixture(failures)
    check_unset_page(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail LAST_UPDATED_FOOTER {failure}")
        return 1

    print("fkst-website dept=site tag=ok LAST_UPDATED_FOOTER")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
