#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TOC_MODULE_PATH = path.join(ROOT, "site", "src", "_includes", "toc.js");

if (!fs.existsSync(TOC_MODULE_PATH)) {
  console.log("fkst-website dept=site tag=skip TOC_ENTRIES implementation=absent");
  process.exit(0);
}

const {
  extractTocEntries
} = require(TOC_MODULE_PATH);

function simplify(entries) {
  return entries.map((entry) => ({
    text: entry.text,
    id: entry.id,
    level: entry.level,
    children: simplify(entry.children)
  }));
}

function testNestedOrderingAndOrphans() {
  const html = `
    <h1 id="ignored-title">Ignored title</h1>
    <h3 id="orphan">Orphan section</h3>
    <h2 id="alpha">Alpha</h2>
    <p>Body.</p>
    <h3 id="alpha-child">Alpha child</h3>
    <h3 id="alpha-second-child">Alpha second child</h3>
    <h2 id="beta">Beta</h2>
    <h3 id="beta-child">Beta child</h3>
    <h4 id="ignored-low">Ignored low heading</h4>
  `;

  assert.deepEqual(simplify(extractTocEntries(html)), [
    {
      text: "Orphan section",
      id: "orphan",
      level: 3,
      children: []
    },
    {
      text: "Alpha",
      id: "alpha",
      level: 2,
      children: [
        {
          text: "Alpha child",
          id: "alpha-child",
          level: 3,
          children: []
        },
        {
          text: "Alpha second child",
          id: "alpha-second-child",
          level: 3,
          children: []
        }
      ]
    },
    {
      text: "Beta",
      id: "beta",
      level: 2,
      children: [
        {
          text: "Beta child",
          id: "beta-child",
          level: 3,
          children: []
        }
      ]
    }
  ]);
}

function testSkipsIncompleteHeadings() {
  const html = `
    <h2>No id</h2>
    <h2 id="">Empty id</h2>
    <h2 id="blank-text"><span> </span></h2>
    <h3 id="also-blank"><em></em></h3>
    <h2 id="kept">Kept</h2>
    <h3 id="kept-child">Kept child</h3>
  `;

  assert.deepEqual(simplify(extractTocEntries(html)), [
    {
      text: "Kept",
      id: "kept",
      level: 2,
      children: [
        {
          text: "Kept child",
          id: "kept-child",
          level: 3,
          children: []
        }
      ]
    }
  ]);
}

function testInlineMarkupEntitiesAndUnicode() {
  const html = `
    <h2 id="inline">
      <span>Launch</span> &amp; verify <code>&lt;safe&gt;</code> &#35;1
    </h2>
    <h3 id="unicode">可靠投递 &#x2713;</h3>
    <h2 id="encoded&amp;id">Encoded id</h2>
  `;

  assert.deepEqual(simplify(extractTocEntries(html)), [
    {
      text: "Launch & verify <safe> #1",
      id: "inline",
      level: 2,
      children: [
        {
          text: "可靠投递 \u2713",
          id: "unicode",
          level: 3,
          children: []
        }
      ]
    },
    {
      text: "Encoded id",
      id: "encoded&id",
      level: 2,
      children: []
    }
  ]);
}

function testEmptyAndNonStringInputs() {
  assert.deepEqual(extractTocEntries(""), []);
  assert.deepEqual(extractTocEntries(null), []);
  assert.deepEqual(extractTocEntries(undefined), []);
}

function main() {
  const tests = [
    testNestedOrderingAndOrphans,
    testSkipsIncompleteHeadings,
    testInlineMarkupEntitiesAndUnicode,
    testEmptyAndNonStringInputs
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok TOC_ENTRIES tests=${tests.length}`);
}

main();
