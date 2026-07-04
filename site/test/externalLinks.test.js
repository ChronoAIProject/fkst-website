#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const markdownIt = require("markdown-it");

const { addCodeBlockCopyControls } = require("../lib/codeBlockCopy");
const {
  addExternalLinkMarkers,
  externalLinkAttributes,
  externalLinkMarker,
  isExternalLinkTarget,
  parseHttpLinkTarget,
  renderExternalLinkMarker,
  shouldUseEleventyUrlFilter,
} = require("../lib/externalLinks");

const MARKER_HTML = renderExternalLinkMarker();

function parsedHref(href) {
  const url = parseHttpLinkTarget(href);
  return url ? url.href : null;
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function parseAttributes(source) {
  const attrs = {};
  const attrPattern = /([^\s=]+)(?:="([^"]*)")?/g;
  let match;
  while ((match = attrPattern.exec(source)) !== null) {
    attrs[match[1]] = match[2] ?? "";
  }
  return attrs;
}

function parseAnchors(html) {
  const anchors = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = anchorPattern.exec(html)) !== null) {
    anchors.push({
      attrs: parseAttributes(match[1]),
      content: match[2],
      html: match[0],
    });
  }
  return anchors;
}

function classNames(anchor) {
  return (anchor.attrs.class || "").trim().split(/\s+/).filter(Boolean);
}

function classNamesFromAttributes(attributes) {
  const match = attributes.match(/\bclass="([^"]*)"/);
  return match ? match[1].trim().split(/\s+/).filter(Boolean) : [];
}

function renderMarkdown(source) {
  const md = addExternalLinkMarkers(
    addCodeBlockCopyControls(markdownIt({ html: true }))
  );
  return md.render(source);
}

test("parseHttpLinkTarget parses only HTTP-family absolute targets", () => {
  assert.equal(
    parsedHref("https://example.com/docs"),
    "https://example.com/docs"
  );
  assert.equal(
    parsedHref("http://example.com/docs"),
    "http://example.com/docs"
  );
  assert.equal(
    parsedHref("//example.com/docs"),
    "https://example.com/docs"
  );
  assert.equal(
    parsedHref(" https://chronoaiproject.github.io/fkst-website/docs "),
    "https://chronoaiproject.github.io/fkst-website/docs"
  );
  assert.equal(
    parsedHref("//chronoaiproject.github.io/fkst-website/docs"),
    "https://chronoaiproject.github.io/fkst-website/docs"
  );

  for (const href of [
    "/architecture.html",
    "architecture.html",
    "#section",
    "",
    "   ",
    null,
    undefined,
    42,
    {},
    "https://[::1",
    "mailto:team@example.com",
    "tel:+15550100",
  ]) {
    assert.equal(parsedHref(href), null, `${String(href)} should not parse`);
  }
});

test("isExternalLinkTarget classifies external and internal link targets", () => {
  for (const href of [
    "https://example.com/docs",
    "http://example.com/docs",
    "//example.com/docs",
  ]) {
    assert.equal(isExternalLinkTarget(href), true, `${href} should be external`);
  }

  for (const href of [
    "https://chronoaiproject.github.io/fkst-website/docs",
    "//chronoaiproject.github.io/fkst-website/docs",
    "/architecture.html",
    "architecture.html",
    "#section",
    "",
    "   ",
    null,
    undefined,
    42,
    {},
    "https://[::1",
    "mailto:team@example.com",
    "tel:+15550100",
  ]) {
    assert.equal(isExternalLinkTarget(href), false, `${String(href)} should not be external`);
  }
});

test("shouldUseEleventyUrlFilter is reserved for internal path targets", () => {
  for (const href of [
    "/architecture.html",
    "architecture.html",
    "./architecture.html",
    "../architecture.html",
    " zh/ ",
  ]) {
    assert.equal(shouldUseEleventyUrlFilter(href), true, `${href} should use the url filter`);
  }

  for (const href of [
    "https://example.com/docs",
    "http://example.com/docs",
    "//example.com/docs",
    "https://chronoaiproject.github.io/fkst-website/docs",
    "//chronoaiproject.github.io/fkst-website/docs",
    "#section",
    "",
    "   ",
    null,
    undefined,
    42,
    {},
    "https://[::1",
    "mailto:team@example.com",
    "tel:+15550100",
  ]) {
    assert.equal(
      shouldUseEleventyUrlFilter(href),
      false,
      `${String(href)} should not use the url filter`
    );
  }
});

test("externalLinkMarker and externalLinkAttributes mark only external targets", () => {
  assert.equal(externalLinkMarker("https://example.com/docs"), MARKER_HTML);
  assert.equal(externalLinkMarker("/architecture.html"), "");
  assert.equal(externalLinkMarker("mailto:team@example.com"), "");

  assert.equal(
    externalLinkAttributes("https://example.com/docs"),
    ' class="external-link" data-external-link=""'
  );
  assert.equal(
    externalLinkAttributes("https://example.com/docs", "primary-action"),
    ' class="primary-action external-link" data-external-link=""'
  );
  assert.equal(
    externalLinkAttributes("https://example.com/docs", "primary-action external-link"),
    ' class="primary-action external-link" data-external-link=""'
  );
  assert.equal(
    classNamesFromAttributes(
      externalLinkAttributes("https://example.com/docs", "external-link")
    ).filter((className) => className === "external-link").length,
    1
  );
  assert.equal(
    externalLinkAttributes("/architecture.html", "primary-action"),
    ' class="primary-action"'
  );
  assert.equal(externalLinkAttributes("/architecture.html"), "");
  assert.equal(
    externalLinkAttributes(
      "https://example.com/docs",
      `primary-action "quoted&<value>'`
    ),
    ' class="primary-action &quot;quoted&amp;&lt;value&gt;&#39; external-link" data-external-link=""'
  );
});

test("Markdown rendering marks external links without changing hrefs or targets", () => {
  const cases = [
    ["Outbound HTTPS", "https://example.com/docs", true],
    ["Outbound HTTP", "http://example.org/docs", true],
    ["Protocol external", "//example.net/docs", true],
    [
      "Same origin absolute",
      "https://chronoaiproject.github.io/fkst-website/docs",
      false,
    ],
    [
      "Same origin protocol",
      "//chronoaiproject.github.io/fkst-website/docs",
      false,
    ],
    ["Root internal", "/architecture.html", false],
    ["Relative", "architecture.html", false],
    ["Hash", "#section", false],
    ["Email", "mailto:team@example.com", false],
    ["Phone", "tel:+15550100", false],
  ];

  const html = renderMarkdown(
    cases.map(([label, href]) => `[${label}](${href})`).join("\n\n")
  );
  const anchors = parseAnchors(html);

  assert.equal(anchors.length, cases.length);
  assert.equal(countOccurrences(html, "target="), 0, "links must not gain target attributes");

  for (const [index, [label, href, isExternal]] of cases.entries()) {
    const anchor = anchors[index];
    assert.equal(anchor.attrs.href, href, `${label} href should be unchanged`);

    if (isExternal) {
      assert.ok(
        classNames(anchor).includes("external-link"),
        `${label} should have external-link class`
      );
      assert.equal(anchor.attrs["data-external-link"], "");
      assert.ok(
        anchor.content.endsWith(MARKER_HTML),
        `${label} marker should be immediately before </a>`
      );
      assert.equal(countOccurrences(anchor.content, MARKER_HTML), 1);
    } else {
      assert.equal(
        classNames(anchor).includes("external-link"),
        false,
        `${label} should not have external-link class`
      );
      assert.equal("data-external-link" in anchor.attrs, false);
      assert.equal(anchor.content.includes(MARKER_HTML), false);
    }
  }
});
