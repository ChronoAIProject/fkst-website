#!/usr/bin/env python3
"""Smoke-check rendered footer last-updated metadata."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
OUTPUT_DIR = SITE_DIR / "_site"
INVALID_SOURCE_FIXTURE = SITE_DIR / "src" / "__last_updated_invalid.njk"
INVALID_OUTPUT_FIXTURE = OUTPUT_DIR / "__last_updated_invalid" / "index.html"
MISSING_SOURCE_FIXTURE = SITE_DIR / "src" / "__last_updated_missing.njk"
MISSING_OUTPUT_FIXTURE = OUTPUT_DIR / "__last_updated_missing" / "index.html"
DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REAL_PAGE_ROUTES = (
    ("/", "English homepage", SITE_DIR / "src" / "index.njk"),
    ("/zh/", "Chinese homepage", SITE_DIR / "src" / "zh" / "index.njk"),
)


@dataclass
class LastUpdatedRecord:
    attrs: dict[str, str]
    text: str = ""


class LastUpdatedParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.footer_depth = 0
        self.records: list[LastUpdatedRecord] = []
        self.last_updated_prefix_count = 0
        self._current_record: LastUpdatedRecord | None = None

    @property
    def in_footer(self) -> bool:
        return self.footer_depth > 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {name: value or "" for name, value in attrs}
        if tag == "footer":
            self.footer_depth += 1
        if self.in_footer and "data-last-updated" in attr:
            record = LastUpdatedRecord(attrs=attr)
            self.records.append(record)
            self._current_record = record

    def handle_endtag(self, tag: str) -> None:
        if self._current_record and tag == "time":
            self._current_record = None
        if tag == "footer" and self.footer_depth:
            self.footer_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.in_footer and "Last updated:" in data:
            self.last_updated_prefix_count += data.count("Last updated:")
        if self._current_record:
            self._current_record.text += data


def build_closed_metadata_fixtures() -> subprocess.CompletedProcess[str]:
    INVALID_SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/page.njk
            permalink: /__last_updated_invalid/
            lang: en
            title: Invalid Last Updated Fixture | fkst
            description: "Smoke fixture for invalid last-updated metadata."
            brandHref: /
            nav:
              - label: Home
                href: /
            localeCode: en
            localeAlternates:
              en: /__last_updated_invalid/
              zh-CN: /zh/
            footerText: Invalid metadata fixture.
            eleventyComputed:
              lastUpdated: not-a-date
            ---
            <p>Invalid metadata fixture.</p>
            """
        ),
        encoding="utf-8",
    )
    MISSING_SOURCE_FIXTURE.write_text(
        textwrap.dedent(
            """\
            ---
            layout: layouts/page.njk
            permalink: /__last_updated_missing/
            lang: en
            title: Missing Last Updated Fixture | fkst
            description: "Smoke fixture for missing last-updated metadata."
            brandHref: /
            nav:
              - label: Home
                href: /
            localeCode: en
            localeAlternates:
              en: /__last_updated_missing/
              zh-CN: /zh/
            footerText: Missing metadata fixture.
            eleventyComputed:
              lastUpdated:
            ---
            <p>Missing metadata fixture.</p>
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
        INVALID_SOURCE_FIXTURE.unlink(missing_ok=True)
        MISSING_SOURCE_FIXTURE.unlink(missing_ok=True)


def output_path(route: str) -> Path:
    if route.endswith("/"):
        return OUTPUT_DIR / route.lstrip("/") / "index.html"
    return OUTPUT_DIR / route.lstrip("/")


def parse_html(path: Path, failures: list[str]) -> LastUpdatedParser | None:
    if not path.is_file():
        failures.append(f"missing built file {path}")
        return None

    parser = LastUpdatedParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def valid_date_only(value: str) -> bool:
    if not DATE_ONLY.fullmatch(value):
        return False

    try:
        year, month, day = (int(part) for part in value.split("-"))
        return date(year, month, day).isoformat() == value
    except ValueError:
        return False


def expected_git_date(source_path: Path, label: str, failures: list[str]) -> str | None:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(ROOT),
            "log",
            "-1",
            "--format=%cs",
            "--",
            str(source_path.relative_to(ROOT)),
        ],
        check=False,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        failures.append(f"{label}: could not derive Git last-updated source date: {result.stderr.strip()}")
        return None

    value = result.stdout.strip().splitlines()[0] if result.stdout.strip() else ""
    if not valid_date_only(value):
        failures.append(f"{label}: Git last-updated source date is invalid: {value!r}")
        return None

    return value


def check_real_page(route: str, label: str, source_path: Path, failures: list[str]) -> None:
    parser = parse_html(output_path(route), failures)
    if not parser:
        return
    expected_date = expected_git_date(source_path, label, failures)

    if parser.last_updated_prefix_count != 1:
        failures.append(
            f"{label}: expected exactly one Last updated: footer prefix, "
            f"found {parser.last_updated_prefix_count}"
        )
    if len(parser.records) != 1:
        failures.append(
            f"{label}: expected exactly one data-last-updated footer element, "
            f"found {len(parser.records)}"
        )
        return

    record = parser.records[0]
    datetime = record.attrs.get("datetime", "")
    text = " ".join(record.text.split())
    if not valid_date_only(datetime):
        failures.append(f"{label}: invalid date-only datetime {datetime!r}")
    if expected_date and datetime != expected_date:
        failures.append(
            f"{label}: datetime {datetime!r} must match Git source date {expected_date!r}"
        )
    if text != datetime:
        failures.append(f"{label}: visible date {text!r} must match datetime {datetime!r}")


def check_closed_fixture(path: Path, label: str, failures: list[str]) -> None:
    parser = parse_html(path, failures)
    if not parser:
        return

    if parser.records:
        failures.append(
            f"{label}: malformed lastUpdated data must not render "
            f"data-last-updated elements, found {len(parser.records)}"
        )
    if parser.last_updated_prefix_count:
        failures.append(
            f"{label}: malformed lastUpdated data must not render "
            f"Last updated: text, found {parser.last_updated_prefix_count}"
        )


def check_closed_metadata_fixtures(failures: list[str]) -> None:
    result = build_closed_metadata_fixtures()
    if result.returncode != 0:
        failures.append(
            "closed metadata fixture build failed:\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )
        return

    check_closed_fixture(INVALID_OUTPUT_FIXTURE, "invalid metadata fixture", failures)
    check_closed_fixture(MISSING_OUTPUT_FIXTURE, "missing metadata fixture", failures)


def main() -> int:
    failures: list[str] = []
    for route, label, source_path in REAL_PAGE_ROUTES:
        check_real_page(route, label, source_path, failures)
    check_closed_metadata_fixtures(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail LAST_UPDATED_FOOTER {failure}")
        return 1

    print(
        "fkst-website dept=site tag=ok LAST_UPDATED_FOOTER "
        f"real_pages={len(REAL_PAGE_ROUTES)} closed_fixtures=2"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
