#!/usr/bin/env python3
"""Smoke-check the header locale scaffold."""

from __future__ import annotations

from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
import json
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
MANIFEST = ROOT / "site" / "probe-manifest"
LOCALES_DATA = ROOT / "site" / "src" / "_data" / "locales.js"
EXPECTED_CODES = ("en", "zh-CN")


@dataclass
class LocaleOption:
    tag: str
    attrs: dict[str, str]
    text: str = ""


class LocaleScaffoldParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.html_lang = ""
        self.switchers: list[dict[str, str]] = []
        self.options: list[LocaleOption] = []
        self._in_switcher = 0
        self._current_option: LocaleOption | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {name: value or "" for name, value in attrs}
        if tag == "html":
            self.html_lang = attr.get("lang", "")
        if tag == "div" and "data-locale-switcher" in attr:
            self.switchers.append(attr)
            self._in_switcher += 1
        if self._in_switcher and "data-locale-option" in attr:
            option = LocaleOption(tag=tag, attrs=attr)
            self.options.append(option)
            self._current_option = option

    def handle_endtag(self, tag: str) -> None:
        if self._current_option and tag == self._current_option.tag:
            self._current_option = None
        if tag == "div" and self._in_switcher:
            self._in_switcher -= 1

    def handle_data(self, data: str) -> None:
        if self._current_option:
            self._current_option.text += data


def manifest_paths() -> list[str]:
    paths: list[str] = []
    for raw_line in MANIFEST.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if line:
            paths.append(line)
    return paths


def output_path(route: str) -> Path:
    if route.endswith("/"):
        return SITE_DIR / route.lstrip("/") / "index.html"
    return SITE_DIR / route.lstrip("/")


def read_supported_locales(failures: list[str]) -> list[dict[str, str]]:
    script = (
        "const data = require(process.argv[1]);"
        "process.stdout.write(JSON.stringify(data.supportedLocales));"
    )
    result = subprocess.run(
        ["node", "-e", script, str(LOCALES_DATA)],
        cwd=ROOT,
        check=False,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        failures.append(f"could not load locale registry: {result.stderr.strip()}")
        return []
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        failures.append(f"locale registry did not return JSON: {exc}")
        return []
    if not isinstance(data, list):
        failures.append("locale registry must export supportedLocales as a list")
        return []
    return data


def check_registry(failures: list[str]) -> dict[str, dict[str, str]]:
    locales = read_supported_locales(failures)
    registry: dict[str, dict[str, str]] = {}
    for entry in locales:
        if not isinstance(entry, dict):
            failures.append(f"locale registry entry is not an object: {entry!r}")
            continue
        code = entry.get("code")
        if not isinstance(code, str):
            failures.append(f"locale registry entry missing string code: {entry!r}")
            continue
        registry[code] = entry

    codes = tuple(registry)
    if codes != EXPECTED_CODES:
        failures.append(f"expected supported locale codes {EXPECTED_CODES!r}, found {codes!r}")

    expected = {
        "en": {"htmlLang": "en", "label": "EN", "name": "English"},
        "zh-CN": {
            "htmlLang": "zh-Hans",
            "label": "中文",
            "name": "Simplified Chinese",
        },
    }
    for code, fields in expected.items():
        entry = registry.get(code, {})
        for field, value in fields.items():
            if entry.get(field) != value:
                failures.append(
                    f"locale {code}: expected {field}={value!r}, found {entry.get(field)!r}"
                )

    return registry


def parse_route(route: str, failures: list[str]) -> LocaleScaffoldParser | None:
    path = output_path(route)
    if not path.is_file():
        failures.append(f"{route}: missing built file {path}")
        return None

    parser = LocaleScaffoldParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def check_route(
    route: str,
    registry: dict[str, dict[str, str]],
    failures: list[str],
) -> None:
    parser = parse_route(route, failures)
    if not parser:
        return

    if len(parser.switchers) != 1:
        failures.append(f"{route}: expected 1 language switcher, found {len(parser.switchers)}")
        return

    label = parser.switchers[0].get("aria-label")
    if label != "Language":
        failures.append(f"{route}: expected language switcher aria-label 'Language', found {label!r}")

    options = {option.attrs.get("data-locale-option", ""): option for option in parser.options}
    codes = tuple(options)
    if codes != EXPECTED_CODES:
        failures.append(f"{route}: expected locale options {EXPECTED_CODES!r}, found {codes!r}")
        return

    current = [option for option in parser.options if option.attrs.get("aria-current") == "page"]
    if len(current) != 1:
        failures.append(f"{route}: expected 1 current locale option, found {len(current)}")
        return

    current_code = current[0].attrs.get("data-locale-option", "")
    expected_current = "zh-CN" if route.startswith("/zh/") else "en"
    if current_code != expected_current:
        failures.append(f"{route}: expected current locale {expected_current}, found {current_code!r}")
    if parser.html_lang != registry.get(current_code, {}).get("htmlLang"):
        failures.append(
            f"{route}: html lang {parser.html_lang!r} does not match current locale {current_code!r}"
        )

    for code, entry in registry.items():
        option = options.get(code)
        if not option:
            continue
        if option.text.strip() != entry.get("label"):
            failures.append(
                f"{route}: expected {code} label {entry.get('label')!r}, found {option.text.strip()!r}"
            )
        if code != current_code:
            if option.tag != "a":
                failures.append(f"{route}: non-current locale {code} must render as a link")
            if option.attrs.get("hreflang") != code:
                failures.append(
                    f"{route}: expected {code} hreflang {code!r}, found {option.attrs.get('hreflang')!r}"
                )
            if option.attrs.get("lang") != entry.get("htmlLang"):
                failures.append(
                    f"{route}: expected {code} lang {entry.get('htmlLang')!r}, found {option.attrs.get('lang')!r}"
                )
        elif option.tag != "span":
            failures.append(f"{route}: current locale {code} must render as non-link text")


def main() -> int:
    failures: list[str] = []
    registry = check_registry(failures)
    for route in manifest_paths():
        check_route(route, registry, failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail LOCALE_SCAFFOLD {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok LOCALE_SCAFFOLD pages={len(manifest_paths())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
