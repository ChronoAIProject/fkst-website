#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  estimateReadingTime
} = require("../site/src/_includes/utils/reading-time");

const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site", "_site");
const ARTICLE_PATHS = [
  "architecture.html",
  "doctrine.html",
  path.join("zh", "architecture.html"),
  path.join("zh", "doctrine.html")
];

function stripTags(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractRequiredMatch(html, pattern, message) {
  const match = html.match(pattern);
  assert.ok(match, message);
  return match;
}

function assertArticleMarkup(relativePath) {
  const filePath = path.join(SITE_DIR, relativePath);
  const html = fs.readFileSync(filePath, "utf8");
  const header = extractRequiredMatch(
    html,
    /<section class="page-header article-header"[\s\S]*?<\/section>/,
    `${relativePath}: missing article header`
  )[0];
  const content = extractRequiredMatch(
    html,
    /<div class="page-content">([\s\S]*?)<\/div>\s*<\/main>/,
    `${relativePath}: missing article body content`
  )[1];
  const allMetaMatches = [...html.matchAll(/\sdata-reading-time(?:[=>\s]|$)/g)];
  assert.equal(
    allMetaMatches.length,
    1,
    `${relativePath}: expected exactly one reading-time element on the page`
  );

  const titleIndex = header.indexOf('id="page-title"');
  const metaIndex = header.indexOf("data-reading-time");
  assert.notEqual(titleIndex, -1, `${relativePath}: missing page title`);
  assert.notEqual(metaIndex, -1, `${relativePath}: missing reading-time metadata`);
  assert.ok(
    metaIndex > titleIndex,
    `${relativePath}: reading-time metadata must follow the page title`
  );

  const metaMatches = [
    ...header.matchAll(/<p class="article-meta"[^>]*data-reading-time[^>]*>([\s\S]*?)<\/p>/g)
  ];
  assert.equal(
    metaMatches.length,
    1,
    `${relativePath}: expected exactly one reading-time element`
  );

  const label = stripTags(metaMatches[0][1]);
  const expectedEstimate = estimateReadingTime(content);

  assert.equal(
    label,
    expectedEstimate.label,
    `${relativePath}: reading-time label must be derived from article body content`
  );
  assert.match(
    label,
    /^(Less than 1 min read|[1-9][0-9]* min read)$/,
    `${relativePath}: unexpected reading-time label "${label}"`
  );
}

function main() {
  for (const articlePath of ARTICLE_PATHS) {
    assertArticleMarkup(articlePath);
  }

  console.log(`fkst-website dept=site tag=ok READING_TIME pages=${ARTICLE_PATHS.length}`);
}

main();
