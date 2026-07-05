#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  docsTocEntriesForPage,
  docsTocHref,
  normalizeDocsTocEntry,
  recordDocsTocEntry,
  resetDocsTocRegistry,
} = require("../lib/docsToc");

test("normalizeDocsTocEntry returns the shared TOC entry shape", () => {
  assert.deepEqual(
    normalizeDocsTocEntry({
      id: "delivery-model",
      title: "Reliable delivery",
      level: "2",
      depth: 2,
    }),
    {
      id: "delivery-model",
      text: "Reliable delivery",
      title: "Reliable delivery",
      level: 2,
      depth: 2,
    }
  );
});

test("normalizeDocsTocEntry accepts text as the title source", () => {
  assert.deepEqual(
    normalizeDocsTocEntry({
      id: "repo-model",
      text: "Repository ecosystem",
      level: 3,
    }),
    {
      id: "repo-model",
      text: "Repository ecosystem",
      title: "Repository ecosystem",
      level: 3,
      depth: 3,
    }
  );
});

test("normalizeDocsTocEntry rejects entries without a stable id or title", () => {
  assert.equal(normalizeDocsTocEntry({ id: "missing-title" }), null);
  assert.equal(normalizeDocsTocEntry({ title: "Missing id" }), null);
});

test("recordDocsTocEntry stores isolated copies by page", () => {
  const page = { inputPath: "./src/architecture.njk" };

  resetDocsTocRegistry();
  recordDocsTocEntry(page, {
    id: "company-model",
    title: "Company model",
    level: 2,
  });

  const entries = docsTocEntriesForPage(page);
  assert.deepEqual(entries.map((entry) => entry.id), ["company-model"]);

  entries[0].title = "Mutated";
  assert.equal(docsTocEntriesForPage(page)[0].title, "Company model");
  assert.deepEqual(docsTocEntriesForPage({ inputPath: "./src/doctrine.njk" }), []);
});

test("docsTocHref encodes fragment ids without changing the data shape", () => {
  assert.equal(docsTocHref("company model"), "#company%20model");
  assert.equal(docsTocHref(""), "#");
});
