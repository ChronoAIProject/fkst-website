#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  countReadableWords,
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

  assert.equal(
    countReadableWords("<p>Hello <strong>reader</strong>.</p>"),
    2,
    "HTML tags must not inflate readable word counts"
  );
  assert.equal(
    countReadableWords("<p>One&nbsp;two &amp; three.</p>"),
    3,
    "HTML entities must normalize into readable text or spacing"
  );
  assert.equal(
    countReadableWords(
      "<p>Visible words</p><script>hidden words here</script><style>.hidden { color: red; }</style>"
    ),
    2,
    "script and style blocks must not inflate readable word counts"
  );
  assert.equal(
    countReadableWords("<p>可靠投递 keeps events durable.</p>"),
    7,
    "CJK-heavy prose must count readable CJK characters"
  );
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
    /<div class="page-content"[^>]*>([\s\S]*?)<\/div>\s*<\/main>/,
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
  assertUtilityShape();

  for (const articlePath of ARTICLE_PATHS) {
    assertArticleMarkup(articlePath);
  }

  console.log(`fkst-website dept=site tag=ok READING_TIME pages=${ARTICLE_PATHS.length}`);
}

main();
