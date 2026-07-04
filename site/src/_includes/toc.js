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

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  "#39": "'"
};

function decodeText(text) {
  return text.replace(/&([a-zA-Z0-9#]+);/g, (match, name) => ENTITIES[name] || match);
}

function normalizeText(html) {
  return decodeText(html.replace(TAG_RE, " ")).replace(/\s+/g, " ").trim();
}

function getId(attrs) {
  const match = attrs.match(ID_RE);
  return match ? match[2].trim() : "";
}

function toTocEntry(match) {
  const level = Number(match[1]);
  const id = getId(match[2]);
  const text = normalizeText(match[3]);
  if (!id || !text) {
    return null;
  }
  return { text, id, level, children: [] };
}

/**
 * Extracts typed TOC entries from rendered article heading markup.
 *
 * This intentionally stops at a flat scaffold for h2/h3 headings. Scrolling,
 * active state, and deeper nesting belong to the follow-up feature work.
 *
 * @param {string} html
 * @returns {TocEntry[]}
 */
function extractTocEntries(html) {
  if (typeof html !== "string" || html.length === 0) {
    return [];
  }
  return Array.from(html.matchAll(HEADING_RE), toTocEntry).filter(Boolean);
}

module.exports = {
  extractTocEntries
};
