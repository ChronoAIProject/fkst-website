#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { renderHeadingAnchor } = require("../lib/headingAnchors");

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

test("renderHeadingAnchor skips headings without an id", () => {
  assert.equal(renderHeadingAnchor({ label: "Section link" }), "");
});
