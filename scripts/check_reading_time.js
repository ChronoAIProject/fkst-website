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

function assertUtilityShape() {
  assert.deepEqual(estimateReadingTime(""), {
    minutes: 0,
    label: "Less than 1 min read",
    wordCount: 0
  });

  const estimate = estimateReadingTime("word ".repeat(201), {
    wordsPerMinute: 200
  });
  assert.equal(estimate.minutes, 2);
  assert.equal(estimate.label, "2 min read");
  assert.equal(estimate.wordCount, 201);
}

function assertArticleMarkup(relativePath) {
  const filePath = path.join(SITE_DIR, relativePath);
  const html = fs.readFileSync(filePath, "utf8");
  const headerMatch = html.match(
    /<section class="page-header article-header"[\s\S]*?<\/section>/
  );

  assert.ok(headerMatch, `${relativePath}: missing article header`);

  const header = headerMatch[0];
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
  assert.match(
    label,
    /^(Less than 1 min read|[1-9][0-9]* min read)$/,
    `${relativePath}: unexpected reading-time label "${label}"`
  );
}

function main() {
  assertUtilityShape();

  for (const articlePath of ARTICLE_PATHS) {
    assertArticleMarkup(articlePath);
  }

  console.log(`fkst-website dept=site tag=ok READING_TIME pages=${ARTICLE_PATHS.length}`);
}

main();
