"use strict";

/**
 * @typedef {Object} TocEntry
 * @property {string} text
 * @property {string} id
 * @property {number} level
 * @property {TocEntry[]} children
 */

const HEADING_RE = /<h([2-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
const ID_RE = /\bid\s*=\s*(["'])(.*?)\1/i;
const TAG_RE = /<[^>]*>/g;

const NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\"",
};

function decodeEntity(match, name) {
  if (name.startsWith("#x") || name.startsWith("#X")) {
    const codePoint = Number.parseInt(name.slice(2), 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  }
  if (name.startsWith("#")) {
    const codePoint = Number.parseInt(name.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  }
  return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)
    ? NAMED_ENTITIES[name]
    : match;
}

function decodeText(text) {
  return text.replace(/&([a-zA-Z0-9#]+);/g, decodeEntity);
}

function normalizeHeadingText(html) {
  return decodeText(html.replace(TAG_RE, " ")).replace(/\s+/g, " ").trim();
}

function getHeadingId(attrs) {
  const match = attrs.match(ID_RE);
  return match ? decodeText(match[2]).trim() : "";
}

function toTocEntry(match) {
  const level = Number(match[1]);
  const id = getHeadingId(match[2]);
  const text = normalizeHeadingText(match[3]);

  if (!id || !text) {
    return null;
  }

  return {
    text,
    id,
    level,
    children: [],
  };
}

/**
 * Extract nested h2/h3 TOC entries from rendered article heading markup.
 *
 * h3 entries nest under the preceding h2. An orphan h3 remains a top-level
 * entry so the output never invents placeholder headings.
 *
 * @param {string} html
 * @returns {TocEntry[]}
 */
function extractTocEntries(html) {
  if (typeof html !== "string" || html.length === 0) {
    return [];
  }

  const entries = [];
  let currentParent = null;

  for (const match of html.matchAll(HEADING_RE)) {
    const entry = toTocEntry(match);
    if (!entry) {
      continue;
    }

    if (entry.level === 2) {
      entries.push(entry);
      currentParent = entry;
      continue;
    }

    if (currentParent) {
      currentParent.children.push(entry);
    } else {
      entries.push(entry);
    }
  }

  return entries;
}

module.exports = {
  extractTocEntries,
};
