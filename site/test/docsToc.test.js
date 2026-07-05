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

test("normalizeDocsTocEntry accepts h2 and h3 levels with normalized depth", () => {
  assert.deepEqual(
    normalizeDocsTocEntry({
      id: "delivery-model",
      title: "Reliable delivery",
      level: 2,
      depth: "3",
    }),
    {
      id: "delivery-model",
      text: "Reliable delivery",
      title: "Reliable delivery",
      level: 2,
      depth: 3,
    }
  );
  assert.deepEqual(
    normalizeDocsTocEntry({
      id: "package-root-union",
      title: "Package root union",
      level: "3",
      depth: "bad",
    }),
    {
      id: "package-root-union",
      text: "Package root union",
      title: "Package root union",
      level: 3,
      depth: 3,
    }
  );
});

test("normalizeDocsTocEntry rejects entries without a stable id or title", () => {
  assert.equal(normalizeDocsTocEntry({ id: "missing-title" }), null);
  assert.equal(normalizeDocsTocEntry({ title: "Missing id" }), null);
});

test("normalizeDocsTocEntry skips non-article heading levels", () => {
  assert.equal(normalizeDocsTocEntry({ id: "page-title", title: "Page title", level: 1 }), null);
  assert.equal(normalizeDocsTocEntry({ id: "deep", title: "Deep heading", level: 4 }), null);
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

test("recordDocsTocEntry preserves document order and skips invalid entries", () => {
  const page = { inputPath: "./src/doctrine.njk" };

  resetDocsTocRegistry();
  recordDocsTocEntry(page, { id: "markers", title: "Markers are facts", level: 2 });
  recordDocsTocEntry(page, { id: "hidden-detail", title: "Hidden detail", level: 4 });
  recordDocsTocEntry(page, { id: "write-posture", title: "Write posture", level: 3 });

  assert.deepEqual(
    docsTocEntriesForPage(page).map((entry) => [entry.id, entry.level, entry.depth]),
    [
      ["markers", 2, 2],
      ["write-posture", 3, 3],
    ]
  );
});

test("resetDocsTocRegistry clears entries without cross-page leakage", () => {
  const page = { inputPath: "./src/architecture.njk" };

  resetDocsTocRegistry();
  recordDocsTocEntry(page, { id: "company-model", title: "Company model", level: 2 });
  assert.equal(docsTocEntriesForPage(page).length, 1);

  resetDocsTocRegistry();

  assert.deepEqual(docsTocEntriesForPage(page), []);
});

test("docsTocHref encodes fragment ids without changing the data shape", () => {
  assert.equal(docsTocHref("company model"), "#company%20model");
  assert.equal(docsTocHref("写姿态"), "#%E5%86%99%E5%A7%BF%E6%80%81");
  assert.equal(docsTocHref(""), "#");
});
