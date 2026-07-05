"use strict";

const MIN_HEADING_LEVEL = 1;
const MAX_HEADING_LEVEL = 6;

const entriesByPage = new Map();

function pageKey(page) {
  if (!page || typeof page !== "object") {
    return "";
  }

  return String(page.inputPath || page.filePathStem || page.url || "");
}

function normalizeHeadingLevel(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < MIN_HEADING_LEVEL || parsed > MAX_HEADING_LEVEL) {
    return 2;
  }

  return parsed;
}

function normalizeDocsTocEntry(entry = {}) {
  const id = String(entry.id || "").trim();
  const title = String(entry.title || entry.text || "").trim();
  if (!id || !title) {
    return null;
  }

  const level = normalizeHeadingLevel(entry.level);
  const depth = normalizeHeadingLevel(entry.depth ?? level);

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
