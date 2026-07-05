#!/usr/bin/env python3
"""Check the locale registry, script, and rendered switcher contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
import json
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
MANIFEST = ROOT / "site" / "probe-manifest"
LOCALES_DATA = ROOT / "site" / "src" / "_data" / "locales.js"
LOCALE_SCRIPT_SOURCE = ROOT / "site" / "src" / "assets" / "js" / "locale.js"
LOCALE_SCRIPT_OUTPUT = SITE_DIR / "assets" / "js" / "locale.js"
EXPECTED_CODES = ("en", "zh")
EXPECTED_DEFAULT_LOCALE = "en"
EXPECTED_PERSISTENCE_KEY = "fkst-locale"


@dataclass
class LocaleOptionData:
    code: str
    href: str
    hreflang: str
    lang: str
    aria_current: str
    aria_label: str
    classes: list[str]
    label_parts: list[str] = field(default_factory=list)

    @property
    def label(self) -> str:
        return "".join(self.label_parts).strip()


@dataclass
class LocaleSwitcherData:
    aria_label: str
    current: str
    classes: list[str]
    options: list[LocaleOptionData] = field(default_factory=list)


@dataclass
class PageLocaleData:
    html_lang: str = ""
    locale_scripts: int = 0
    switchers: list[LocaleSwitcherData] = field(default_factory=list)


class LocaleScaffoldParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.page = PageLocaleData()
        self._switcher_stack: list[LocaleSwitcherData] = []
        self._option_stack: list[LocaleOptionData] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {name: value or "" for name, value in attrs}
        if tag == "html":
            self.page.html_lang = attr.get("lang", "")
        if tag == "script" and "data-locale-script" in attr:
            self.page.locale_scripts += 1
        if tag == "nav" and "data-locale-switcher" in attr:
            switcher = LocaleSwitcherData(
                aria_label=attr.get("aria-label", ""),
                current=attr.get("data-locale-current", ""),
                classes=(attr.get("class") or "").split(),
            )
            self.page.switchers.append(switcher)
            self._switcher_stack.append(switcher)
            return
        if tag == "a" and self._switcher_stack and "data-locale-option" in attr:
            option = LocaleOptionData(
                code=attr.get("data-locale-code", ""),
                href=attr.get("href", ""),
                hreflang=attr.get("hreflang", ""),
                lang=attr.get("lang", ""),
                aria_current=attr.get("aria-current", ""),
                aria_label=attr.get("aria-label", ""),
                classes=(attr.get("class") or "").split(),
            )
            self._switcher_stack[-1].options.append(option)
            self._option_stack.append(option)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._option_stack:
            self._option_stack.pop()
        if tag == "nav" and self._switcher_stack:
            self._switcher_stack.pop()

    def handle_data(self, data: str) -> None:
        if self._option_stack:
            self._option_stack[-1].label_parts.append(data)


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


def read_locale_registry(failures: list[str]) -> dict[str, object]:
    script = (
        "const data = require(process.argv[1]);"
        "process.stdout.write(JSON.stringify({"
        "supportedLocales: data.supportedLocales,"
        "defaultLocale: data.defaultLocale,"
        "persistenceKey: data.persistenceKey,"
        "resolveInvalid: data.resolveLocale('invalid'),"
        "resolveZh: data.resolveLocale('zh'),"
        "supportsEn: data.isSupportedLocale('en'),"
        "supportsZh: data.isSupportedLocale('zh'),"
        "supportsZhCn: data.isSupportedLocale('zh-CN')"
        "}));"
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
        return {}
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        failures.append(f"locale registry did not return JSON: {exc}")
        return {}
    if not isinstance(data, dict):
        failures.append("locale registry probe must return an object")
        return {}
    return data


def validate_registry(data: dict[str, object], failures: list[str]) -> dict[str, dict[str, str]]:
    registry: dict[str, dict[str, str]] = {}
    locales = data.get("supportedLocales")
    if not isinstance(locales, list):
        failures.append("locale registry must export supportedLocales as a list")
        return registry

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
        "zh": {"htmlLang": "zh-Hans", "label": "中文", "name": "Chinese"},
    }
    for code, fields in expected.items():
        entry = registry.get(code, {})
        for field, value in fields.items():
            if entry.get(field) != value:
                failures.append(
                    f"locale {code}: expected {field}={value!r}, found {entry.get(field)!r}"
                )

    if data.get("defaultLocale") != EXPECTED_DEFAULT_LOCALE:
        failures.append(
            f"expected defaultLocale {EXPECTED_DEFAULT_LOCALE!r}, found {data.get('defaultLocale')!r}"
        )
    if data.get("persistenceKey") != EXPECTED_PERSISTENCE_KEY:
        failures.append(
            f"expected persistenceKey {EXPECTED_PERSISTENCE_KEY!r}, found {data.get('persistenceKey')!r}"
        )
    if data.get("resolveInvalid") != EXPECTED_DEFAULT_LOCALE:
        failures.append("resolveLocale must fall back to the default locale for unsupported values")
    if data.get("resolveZh") != "zh":
        failures.append("resolveLocale must preserve supported zh values")
    if data.get("supportsEn") is not True or data.get("supportsZh") is not True:
        failures.append("isSupportedLocale must accept en and zh")
    if data.get("supportsZhCn") is not False:
        failures.append("isSupportedLocale must reject zh-CN for the scaffold contract")

    return registry


def check_registry(failures: list[str]) -> dict[str, dict[str, str]]:
    return validate_registry(read_locale_registry(failures), failures)


def parse_html(html: str) -> LocaleScaffoldParser:
    parser = LocaleScaffoldParser()
    parser.feed(html)
    return parser


def parse_route(route: str, failures: list[str]) -> LocaleScaffoldParser | None:
    path = output_path(route)
    if not path.is_file():
        failures.append(f"{route}: missing built file {path}")
        return None

    return parse_html(path.read_text(encoding="utf-8"))


def validate_route_parser(route: str, parser: LocaleScaffoldParser, failures: list[str]) -> None:
    expected_lang = "zh-Hans" if route.startswith("/zh/") else "en"
    expected_current = "zh" if route.startswith("/zh/") else "en"
    expected_hrefs = {
        "/": {"en": "/fkst-website/", "zh": "/fkst-website/zh/"},
        "/zh/": {"en": "/fkst-website/", "zh": "/fkst-website/zh/"},
        "/architecture.html": {
            "en": "/fkst-website/architecture.html",
            "zh": "/fkst-website/zh/architecture.html",
        },
        "/zh/architecture.html": {
            "en": "/fkst-website/architecture.html",
            "zh": "/fkst-website/zh/architecture.html",
        },
        "/doctrine.html": {
            "en": "/fkst-website/doctrine.html",
            "zh": "/fkst-website/zh/doctrine.html",
        },
        "/zh/doctrine.html": {
            "en": "/fkst-website/doctrine.html",
            "zh": "/fkst-website/zh/doctrine.html",
        },
    }
    expected_labels = {"en": "EN", "zh": "中文"}
    expected_names = {"en": "English", "zh": "Chinese"}
    expected_langs = {"en": "en", "zh": "zh-Hans"}

    if parser.page.html_lang != expected_lang:
        failures.append(
            f"{route}: expected html lang {expected_lang!r}, found {parser.page.html_lang!r}"
        )
    if parser.page.locale_scripts != 1:
        failures.append(f"{route}: expected 1 locale scaffold script, found {parser.page.locale_scripts}")
    if len(parser.page.switchers) != 1:
        failures.append(f"{route}: expected 1 locale switcher, found {len(parser.page.switchers)}")
        return

    switcher = parser.page.switchers[0]
    if "locale-switcher" not in switcher.classes:
        failures.append(f"{route}: locale switcher missing locale-switcher class")
    if switcher.aria_label != "Language":
        failures.append(f"{route}: expected switcher aria-label 'Language', found {switcher.aria_label!r}")
    if switcher.current != expected_current:
        failures.append(
            f"{route}: expected data-locale-current {expected_current!r}, found {switcher.current!r}"
        )
    if len(switcher.options) != 2:
        failures.append(f"{route}: expected 2 locale options, found {len(switcher.options)}")
        return

    seen_codes = [option.code for option in switcher.options]
    if seen_codes != ["en", "zh"]:
        failures.append(f"{route}: expected locale option order ['en', 'zh'], found {seen_codes!r}")

    current_count = 0
    for option in switcher.options:
        if "locale-switcher-option" not in option.classes:
            failures.append(f"{route}: {option.code}: missing locale-switcher-option class")
        if option.label != expected_labels.get(option.code):
            failures.append(
                f"{route}: {option.code}: expected label {expected_labels.get(option.code)!r}, found {option.label!r}"
            )
        if option.href != expected_hrefs.get(route, {}).get(option.code):
            failures.append(
                f"{route}: {option.code}: expected href {expected_hrefs.get(route, {}).get(option.code)!r}, found {option.href!r}"
            )
        if option.hreflang != expected_langs.get(option.code):
            failures.append(
                f"{route}: {option.code}: expected hreflang {expected_langs.get(option.code)!r}, found {option.hreflang!r}"
            )
        if option.lang != expected_langs.get(option.code):
            failures.append(
                f"{route}: {option.code}: expected lang {expected_langs.get(option.code)!r}, found {option.lang!r}"
            )
        if option.code == expected_current:
            current_count += 1
            if option.aria_current != "page":
                failures.append(f"{route}: {option.code}: current locale missing aria-current='page'")
            if "is-current" not in option.classes:
                failures.append(f"{route}: {option.code}: current locale missing is-current class")
            if option.aria_label != f"{expected_names.get(option.code)}, current language":
                failures.append(
                    f"{route}: {option.code}: current locale aria-label must include current state, found {option.aria_label!r}"
                )
        else:
            if option.aria_current:
                failures.append(
                    f"{route}: {option.code}: non-current locale must not have aria-current, found {option.aria_current!r}"
                )
            if "is-current" in option.classes:
                failures.append(f"{route}: {option.code}: non-current locale must not have is-current class")

    if current_count != 1:
        failures.append(f"{route}: expected exactly one current locale option, found {current_count}")


def check_route(route: str, failures: list[str]) -> None:
    parser = parse_route(route, failures)
    if parser:
        validate_route_parser(route, parser, failures)


def check_script_copy(failures: list[str]) -> None:
    if not LOCALE_SCRIPT_SOURCE.is_file():
        failures.append(f"missing locale scaffold script {LOCALE_SCRIPT_SOURCE}")
        return
    if not LOCALE_SCRIPT_OUTPUT.is_file():
        failures.append(f"missing built locale scaffold script {LOCALE_SCRIPT_OUTPUT}")
        return
    if LOCALE_SCRIPT_SOURCE.read_text(encoding="utf-8") != LOCALE_SCRIPT_OUTPUT.read_text(
        encoding="utf-8"
    ):
        failures.append("built locale scaffold script differs from source asset")


def main() -> int:
    failures: list[str] = []
    check_registry(failures)
    check_script_copy(failures)
    routes = manifest_paths()
    for route in routes:
        check_route(route, failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail LOCALE_SCAFFOLD {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok LOCALE_SCAFFOLD pages={len(routes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
