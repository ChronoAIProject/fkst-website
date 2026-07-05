"use strict";

const DEFAULT_DOCS_TOC_LEVEL = 2;
const MIN_DOCS_TOC_LEVEL = 2;
const MAX_DOCS_TOC_LEVEL = 3;

const entriesByPage = new Map();

function pageKey(page) {
  if (!page || typeof page !== "object") {
    return "";
  }

  return String(page.inputPath || page.filePathStem || page.url || "");
}

function normalizeHeadingLevel(value, fallback = DEFAULT_DOCS_TOC_LEVEL) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  if (parsed < MIN_DOCS_TOC_LEVEL || parsed > MAX_DOCS_TOC_LEVEL) {
    return null;
  }

  return parsed;
}

function normalizeHeadingDepth(value, level) {
  const normalized = normalizeHeadingLevel(value, level);
  return normalized || level;
}

function normalizeDocsTocEntry(entry = {}) {
  const id = String(entry.id || "").trim();
  const title = String(entry.title || entry.text || "").trim();
  if (!id || !title) {
    return null;
  }

  const level = normalizeHeadingLevel(entry.level);
  if (!level) {
    return null;
  }
  const depth = normalizeHeadingDepth(entry.depth, level);

  return {
    id,
    text: title,
    title,
    level,
    depth,
  };
}

function resetDocsTocRegistry() {
  entriesByPage.clear();
}

function recordDocsTocEntry(page, entry) {
  const key = pageKey(page);
  const normalized = normalizeDocsTocEntry(entry);
  if (!key || !normalized) {
    return normalized;
  }

  const entries = entriesByPage.get(key) || [];
  entries.push(normalized);
  entriesByPage.set(key, entries);
  return normalized;
}

function docsTocEntriesForPage(page) {
  const entries = entriesByPage.get(pageKey(page)) || [];
  return entries.map((entry) => ({ ...entry }));
}

function docsTocHref(id) {
  const normalized = String(id || "").trim();
  return normalized ? `#${encodeURIComponent(normalized)}` : "#";
}

module.exports = {
  docsTocEntriesForPage,
  docsTocHref,
  normalizeDocsTocEntry,
  recordDocsTocEntry,
  resetDocsTocRegistry,
};
