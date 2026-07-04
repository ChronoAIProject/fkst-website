#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const markdownIt = require("markdown-it");

const {
  addHeadingAnchors,
  renderHeadingAnchor,
  slugifyHeadingText,
} = require("../lib/headingAnchors");

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

function renderMarkdown(source) {
  return addHeadingAnchors(markdownIt({ html: true })).render(source);
}

test("renderHeadingAnchor returns a clickable fragment link for a heading id", () => {
  const html = renderHeadingAnchor({
    id: "company-model",
    label: "Link to Company model section",
  });
  const anchors = parseAnchors(html);

  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].attrs.href, "#company-model");
  assert.equal(anchors[0].attrs["aria-label"], "Link to Company model section");
  assert.equal(anchors[0].attrs["data-heading-anchor"], "");
});

test("Markdown headings render deterministic ids and anchor links", () => {
  const html = renderMarkdown("## Company model\n\nBody text.");
  const anchors = parseAnchors(html);

  assert.match(html, /<h2 id="company-model" class="heading-anchor-target">Company model/);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].attrs.href, "#company-model");
  assert.equal(anchors[0].attrs["aria-label"], "Link to Company model section");
  assert.equal(anchors[0].attrs["data-heading-anchor"], "");
});

test("Markdown heading slugs are unique within a rendered document", () => {
  const html = renderMarkdown("## Repeat\n\n## Repeat");
  const anchors = parseAnchors(html);

  assert.match(html, /<h2 id="repeat" class="heading-anchor-target">Repeat/);
  assert.match(html, /<h2 id="repeat-2" class="heading-anchor-target">Repeat/);
  assert.deepEqual(
    anchors.map((anchor) => anchor.attrs.href),
    ["#repeat", "#repeat-2"]
  );
});

test("slugifyHeadingText keeps generated ids stable for section text", () => {
  assert.equal(slugifyHeadingText("Company model"), "company-model");
  assert.equal(slugifyHeadingText("Reliable delivery!"), "reliable-delivery");
  assert.equal(slugifyHeadingText("  Current   shape  "), "current-shape");
});
