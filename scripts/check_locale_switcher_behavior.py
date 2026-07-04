#!/usr/bin/env python3
"""Behavior tests for the header language switcher contract."""

from __future__ import annotations

from copy import deepcopy
from html import escape
import importlib.util
from pathlib import Path
import sys
from types import ModuleType


ROOT = Path(__file__).resolve().parents[1]
SCAFFOLD_SCRIPT = ROOT / "scripts" / "check_locale_scaffold.py"

EXPECTED_REGISTRY = (
    {
        "code": "en",
        "htmlLang": "en",
        "label": "EN",
        "name": "English",
    },
    {
        "code": "zh-CN",
        "htmlLang": "zh-Hans",
        "label": "\u4e2d\u6587",
        "name": "Simplified Chinese",
    },
)
EXPECTED_ROUTE_MATRIX = {
    "/": {"en": "/fkst-website/", "zh-CN": "/fkst-website/zh/"},
    "/zh/": {"en": "/fkst-website/", "zh-CN": "/fkst-website/zh/"},
    "/architecture.html": {
        "en": "/fkst-website/architecture.html",
        "zh-CN": "/fkst-website/zh/architecture.html",
    },
    "/zh/architecture.html": {
        "en": "/fkst-website/architecture.html",
        "zh-CN": "/fkst-website/zh/architecture.html",
    },
    "/doctrine.html": {
        "en": "/fkst-website/doctrine.html",
        "zh-CN": "/fkst-website/zh/doctrine.html",
    },
    "/zh/doctrine.html": {
        "en": "/fkst-website/doctrine.html",
        "zh-CN": "/fkst-website/zh/doctrine.html",
    },
}


def load_scaffold_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_locale_scaffold", SCAFFOLD_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load scaffold checker from {SCAFFOLD_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["check_locale_scaffold"] = module
    spec.loader.exec_module(module)
    return module


SCAFFOLD = load_scaffold_module()


def registry_by_code() -> dict[str, dict[str, str]]:
    return {entry["code"]: dict(entry) for entry in EXPECTED_REGISTRY}


def current_code_for_route(route: str) -> str:
    return "zh-CN" if route.startswith("/zh/") else "en"


def render_attrs(attrs: dict[str, str]) -> str:
    return "".join(f' {name}="{escape(value, quote=True)}"' for name, value in attrs.items())


def default_options(route: str) -> list[dict[str, object]]:
    current_code = current_code_for_route(route)
    options: list[dict[str, object]] = []
    for entry in EXPECTED_REGISTRY:
        code = entry["code"]
        if code == current_code:
            options.append(
                {
                    "tag": "span",
                    "attrs": {
                        "aria-current": "page",
                        "data-locale-option": code,
                    },
                    "text": entry["label"],
                }
            )
        else:
            options.append(
                {
                    "tag": "a",
                    "attrs": {
                        "href": EXPECTED_ROUTE_MATRIX[route][code],
                        "hreflang": code,
                        "lang": entry["htmlLang"],
                        "data-locale-option": code,
                    },
                    "text": entry["label"],
                }
            )
    return options


def option_for(options: list[dict[str, object]], code: str) -> dict[str, object]:
    for option in options:
        attrs = option["attrs"]
        if isinstance(attrs, dict) and attrs.get("data-locale-option") == code:
            return option
    raise AssertionError(f"missing fixture option for locale {code}")


def non_current_code(route: str) -> str:
    current_code = current_code_for_route(route)
    return next(entry["code"] for entry in EXPECTED_REGISTRY if entry["code"] != current_code)


def render_option(option: dict[str, object]) -> str:
    tag = str(option["tag"])
    attrs = option["attrs"]
    if not isinstance(attrs, dict):
        raise TypeError("fixture option attrs must be a dict")
    text = escape(str(option["text"]))
    return f"<{tag}{render_attrs(attrs)}>{text}</{tag}>"


def render_route_fixture(
    route: str,
    *,
    aria_label: str = "Language",
    include_switcher: bool = True,
    options: list[dict[str, object]] | None = None,
    switcher_count: int = 1,
    switcher_tag: str = "nav",
) -> str:
    current_code = current_code_for_route(route)
    html_lang = registry_by_code()[current_code]["htmlLang"]
    if not include_switcher:
        return f'<!doctype html><html lang="{html_lang}"><body></body></html>'

    rendered_options = "".join(render_option(option) for option in (options or default_options(route)))
    switcher = (
        f'<{switcher_tag} class="language-switch" aria-label="{escape(aria_label, quote=True)}" '
        f"data-locale-switcher>{rendered_options}</{switcher_tag}>"
    )
    return f'<!doctype html><html lang="{html_lang}"><body>{switcher * switcher_count}</body></html>'


def route_failures(route: str, html: str) -> list[str]:
    failures: list[str] = []
    parser = SCAFFOLD.parse_html(html)
    SCAFFOLD.validate_route_parser(
        route,
        registry_by_code(),
        parser,
        failures,
        EXPECTED_ROUTE_MATRIX,
    )
    return failures


def expect_clean(label: str, failures: list[str], all_failures: list[str]) -> None:
    if failures:
        all_failures.append(f"{label}: expected no failures, found {failures!r}")


def expect_failure(
    label: str,
    failures: list[str],
    expected_fragment: str,
    all_failures: list[str],
) -> None:
    if not failures:
        all_failures.append(f"{label}: expected failure containing {expected_fragment!r}, found none")
        return
    if not any(expected_fragment in failure for failure in failures):
        all_failures.append(
            f"{label}: expected failure containing {expected_fragment!r}, found {failures!r}"
        )


def with_changed_options(route: str, change: object) -> list[dict[str, object]]:
    options = deepcopy(default_options(route))
    change(options)
    return options


def test_locale_registry_contract(all_failures: list[str]) -> None:
    failures: list[str] = []
    registry = SCAFFOLD.validate_registry(SCAFFOLD.read_supported_locales(failures), failures)
    actual = tuple(
        {
            "code": entry.get("code", ""),
            "htmlLang": entry.get("htmlLang", ""),
            "label": entry.get("label", ""),
            "name": entry.get("name", ""),
        }
        for entry in registry.values()
    )
    if actual != EXPECTED_REGISTRY:
        failures.append(f"expected locale registry {EXPECTED_REGISTRY!r}, found {actual!r}")
    expect_clean("locale registry contract", failures, all_failures)

    wrong_order = [dict(EXPECTED_REGISTRY[1]), dict(EXPECTED_REGISTRY[0])]
    order_failures: list[str] = []
    SCAFFOLD.validate_registry(wrong_order, order_failures)
    expect_failure(
        "locale registry rejects wrong supported locale order",
        order_failures,
        "expected supported locale codes",
        all_failures,
    )

    wrong_label = [dict(entry) for entry in EXPECTED_REGISTRY]
    wrong_label[1]["label"] = "ZH"
    label_failures: list[str] = []
    SCAFFOLD.validate_registry(wrong_label, label_failures)
    expect_failure(
        "locale registry rejects wrong visible label",
        label_failures,
        "expected label",
        all_failures,
    )


def test_route_matrix_contract(all_failures: list[str]) -> None:
    if SCAFFOLD.EXPECTED_SWITCHES != EXPECTED_ROUTE_MATRIX:
        all_failures.append(
            f"route matrix: expected {EXPECTED_ROUTE_MATRIX!r}, found {SCAFFOLD.EXPECTED_SWITCHES!r}"
        )

    for route in EXPECTED_ROUTE_MATRIX:
        expect_clean(
            f"{route} positive route fixture",
            route_failures(route, render_route_fixture(route)),
            all_failures,
        )


def test_rendered_site_contract(all_failures: list[str]) -> None:
    failures: list[str] = []
    registry = SCAFFOLD.check_registry(failures)
    routes = SCAFFOLD.manifest_paths()
    SCAFFOLD.validate_manifest_contract(routes, failures, EXPECTED_ROUTE_MATRIX)
    for route in routes:
        if route in EXPECTED_ROUTE_MATRIX:
            parser = SCAFFOLD.parse_route(route, failures)
            if parser:
                SCAFFOLD.validate_route_parser(
                    route,
                    registry,
                    parser,
                    failures,
                    EXPECTED_ROUTE_MATRIX,
                )
    expect_clean("rendered site route matrix", failures, all_failures)


def test_route_negative_fixtures(all_failures: list[str]) -> None:
    route = "/architecture.html"
    current_code = current_code_for_route(route)
    alternate_code = non_current_code(route)

    expect_failure(
        "missing switcher",
        route_failures(route, render_route_fixture(route, include_switcher=False)),
        "expected 1 language switcher, found 0",
        all_failures,
    )
    expect_failure(
        "duplicate switchers",
        route_failures(route, render_route_fixture(route, switcher_count=2)),
        "expected 1 language switcher, found 2",
        all_failures,
    )
    expect_failure(
        "wrong switcher landmark tag",
        route_failures(route, render_route_fixture(route, switcher_tag="div")),
        "must render as a nav landmark",
        all_failures,
    )
    expect_failure(
        "wrong switcher accessible name",
        route_failures(route, render_route_fixture(route, aria_label="Locale")),
        "expected language switcher aria-label 'Language'",
        all_failures,
    )
    expect_failure(
        "missing current option",
        route_failures(
            route,
            render_route_fixture(
                route,
                options=with_changed_options(
                    route,
                    lambda options: option_for(options, current_code)["attrs"].pop("aria-current"),
                ),
            ),
        ),
        "expected 1 current locale option, found 0",
        all_failures,
    )
    expect_failure(
        "duplicate current options",
        route_failures(
            route,
            render_route_fixture(
                route,
                options=with_changed_options(
                    route,
                    lambda options: option_for(options, alternate_code)["attrs"].update(
                        {"aria-current": "page"}
                    ),
                ),
            ),
        ),
        "expected 1 current locale option, found 2",
        all_failures,
    )
    expect_failure(
        "current option with href",
        route_failures(
            route,
            render_route_fixture(
                route,
                options=with_changed_options(
                    route,
                    lambda options: option_for(options, current_code)["attrs"].update(
                        {"href": EXPECTED_ROUTE_MATRIX[route][current_code]}
                    ),
                ),
            ),
        ),
        "must not have href",
        all_failures,
    )
    expect_failure(
        "alternate rendered as non-link",
        route_failures(
            route,
            render_route_fixture(
                route,
                options=with_changed_options(
                    route,
                    lambda options: option_for(options, alternate_code).update({"tag": "span"}),
                ),
            ),
        ),
        "must render as a link",
        all_failures,
    )
    expect_failure(
        "stale reciprocal href",
        route_failures(
            route,
            render_route_fixture(
                route,
                options=with_changed_options(
                    route,
                    lambda options: option_for(options, alternate_code)["attrs"].update(
                        {"href": "/fkst-website/stale.html"}
                    ),
                ),
            ),
        ),
        "expected zh-CN href",
        all_failures,
    )
    expect_failure(
        "wrong hreflang",
        route_failures(
            route,
            render_route_fixture(
                route,
                options=with_changed_options(
                    route,
                    lambda options: option_for(options, alternate_code)["attrs"].update(
                        {"hreflang": "zh"}
                    ),
                ),
            ),
        ),
        "expected zh-CN hreflang",
        all_failures,
    )
    expect_failure(
        "wrong lang",
        route_failures(
            route,
            render_route_fixture(
                route,
                options=with_changed_options(
                    route,
                    lambda options: option_for(options, alternate_code)["attrs"].update(
                        {"lang": "zh"}
                    ),
                ),
            ),
        ),
        "expected zh-CN lang",
        all_failures,
    )
    expect_failure(
        "wrong visible label",
        route_failures(
            route,
            render_route_fixture(
                route,
                options=with_changed_options(
                    route,
                    lambda options: option_for(options, alternate_code).update({"text": "ZH"}),
                ),
            ),
        ),
        "expected zh-CN label",
        all_failures,
    )
    expect_failure(
        "missing alternate option",
        route_failures(
            route,
            render_route_fixture(
                route,
                options=[
                    option
                    for option in default_options(route)
                    if option["attrs"]["data-locale-option"] != alternate_code
                ],
            ),
        ),
        "expected locale options",
        all_failures,
    )


def test_manifest_negative_fixtures(all_failures: list[str]) -> None:
    routes = list(EXPECTED_ROUTE_MATRIX)

    duplicate_failures: list[str] = []
    SCAFFOLD.validate_manifest_contract(routes + [routes[0]], duplicate_failures, EXPECTED_ROUTE_MATRIX)
    expect_failure(
        "duplicate manifest routes",
        duplicate_failures,
        "contains duplicate routes",
        all_failures,
    )

    missing_failures: list[str] = []
    SCAFFOLD.validate_manifest_contract(routes[:-1], missing_failures, EXPECTED_ROUTE_MATRIX)
    expect_failure(
        "missing manifest route",
        missing_failures,
        "missing expected routes",
        all_failures,
    )

    extra_failures: list[str] = []
    SCAFFOLD.validate_manifest_contract(
        routes + ["/unchecked.html"],
        extra_failures,
        EXPECTED_ROUTE_MATRIX,
    )
    expect_failure(
        "unchecked extra manifest route",
        extra_failures,
        "contains unchecked routes",
        all_failures,
    )


def main() -> int:
    failures: list[str] = []
    tests = (
        test_locale_registry_contract,
        test_route_matrix_contract,
        test_rendered_site_contract,
        test_route_negative_fixtures,
        test_manifest_negative_fixtures,
    )
    for test in tests:
        test(failures)

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail LOCALE_SWITCHER_BEHAVIOR {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok LOCALE_SWITCHER_BEHAVIOR tests={len(tests)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
