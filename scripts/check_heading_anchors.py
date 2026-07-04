#!/usr/bin/env python3
"""Check rendered section heading anchor links."""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site" / "_site"
MANIFEST = ROOT / "site" / "probe-manifest"


@dataclass
class Anchor:
    href: str
    attrs: dict[str, str]


@dataclass
class Heading:
    tag: str
    heading_id: str
    classes: set[str]
    anchors: list[Anchor] = field(default_factory=list)


class HeadingAnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.headings: list[Heading] = []
        self._heading_stack: list[Heading] = []

    @property
    def _current_heading(self) -> Heading | None:
        return self._heading_stack[-1] if self._heading_stack else None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {name: value or "" for name, value in attrs}
        if tag in {"h2", "h3", "h4", "h5", "h6"}:
            heading = Heading(
                tag=tag,
                heading_id=attr.get("id", ""),
                classes=set((attr.get("class") or "").split()),
            )
            self.headings.append(heading)
            self._heading_stack.append(heading)
            return

        heading = self._current_heading
        if tag == "a" and heading and "data-heading-anchor" in attr:
            heading.anchors.append(Anchor(href=attr.get("href", ""), attrs=attr))

    def handle_endtag(self, tag: str) -> None:
        if self._heading_stack and tag == self._heading_stack[-1].tag:
            self._heading_stack.pop()


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


def check_heading(route: str, heading: Heading) -> list[str]:
    failures: list[str] = []
    if "heading-anchor-target" not in heading.classes:
        return failures

    if not heading.heading_id:
        failures.append(f"{route}: heading-anchor-target is missing id")
        return failures

    if len(heading.anchors) != 1:
        failures.append(
            f"{route}: heading #{heading.heading_id} expected 1 heading anchor, found {len(heading.anchors)}"
        )
        return failures

    anchor = heading.anchors[0]
    expected_href = f"#{heading.heading_id}"
    if anchor.href != expected_href:
        failures.append(
            f"{route}: heading #{heading.heading_id} anchor href {anchor.href!r} != {expected_href!r}"
        )
    if not anchor.attrs.get("aria-label"):
        failures.append(f"{route}: heading #{heading.heading_id} anchor is missing aria-label")

    return failures


def main() -> int:
    failures: list[str] = []
    checked = 0

    for route in manifest_paths():
        path = output_path(route)
        if not path.is_file():
            failures.append(f"{route}: missing built file {path}")
            continue

        parser = HeadingAnchorParser()
        parser.feed(path.read_text(encoding="utf-8"))

        for heading in parser.headings:
            if "heading-anchor-target" in heading.classes:
                checked += 1
            failures.extend(check_heading(route, heading))

    if checked == 0:
        failures.append("no rendered heading-anchor-target elements found")

    if failures:
        for failure in failures:
            print(f"fkst-website dept=site tag=fail HEADING_ANCHORS {failure}")
        return 1

    print(f"fkst-website dept=site tag=ok HEADING_ANCHORS headings={checked}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
