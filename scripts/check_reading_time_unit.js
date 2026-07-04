#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

const {
  DEFAULT_WORDS_PER_MINUTE,
  countReadableWords,
  estimateReadingTime,
  readableText
} = require("../site/src/_includes/utils/reading-time");

const EMPTY_ESTIMATE = {
  minutes: 0,
  label: "Less than 1 min read",
  wordCount: 0
};

function words(count) {
  return Array.from({ length: count }, (_, index) => `word${index + 1}`).join(" ");
}

function assertEmptyInputEstimate(input) {
  assert.deepEqual(
    estimateReadingTime(input),
    EMPTY_ESTIMATE,
    `${String(input)} should produce the safe empty estimate`
  );
  assert.equal(
    countReadableWords(input),
    0,
    `${String(input)} should have no readable words`
  );
}

function assertEmptyInputs() {
  for (const input of ["", "   \n\t  ", null, undefined, 42, false, {}, []]) {
    assertEmptyInputEstimate(input);
  }
}

function assertPlainTextCounting() {
  assert.equal(
    countReadableWords("Hello, reader. It's 2026 and fkst ships."),
    7,
    "English prose, contractions, and numbers should count predictably"
  );
  assert.equal(
    countReadableWords("Café naïve résumé coöperate 123 don't O'Neill"),
    7,
    "Unicode words and ASCII contractions should count as single words"
  );
}

function assertCjkCounting() {
  assert.equal(
    countReadableWords("可靠投递 keeps events durable."),
    7,
    "CJK characters should count alongside Latin words"
  );
  assert.equal(
    countReadableWords("读写 durable 123 test"),
    5,
    "Mixed CJK, Latin words, and numbers should not double-count"
  );
  assert.equal(
    countReadableWords("かな 한글 abc"),
    5,
    "Hiragana and Hangul characters should count as readable CJK-family text"
  );
}

function assertMarkupSanitizer() {
  assert.equal(
    readableText("<p>Hello <strong>reader</strong>.</p>"),
    "Hello reader .",
    "HTML tags should collapse to spacing without adding readable words"
  );
  assert.equal(
    countReadableWords("<p>Hello <strong>reader</strong>.</p>"),
    2,
    "Nested formatting tags should not inflate word counts"
  );
  assert.equal(
    readableText("<p>Visible <!-- hidden words --> words <em>only</em></p>"),
    "Visible words only",
    "HTML comments should be removed from readable text"
  );
  assert.equal(
    countReadableWords(
      "<p>Visible words</p><script>hidden words here</script><style>.hidden { color: red; }</style>"
    ),
    2,
    "script and style blocks should not inflate readable word counts"
  );
}

function assertEntityHandling() {
  assert.equal(
    readableText("One&nbsp;two &amp; three &quot;four&quot; &apos;five&apos;"),
    "One two & three \"four\" 'five'",
    "named entities should decode or normalize consistently"
  );
  assert.equal(
    readableText("&#34;quote&#34; &#x4E03; &unknown; &bad"),
    '"quote" 七 &bad',
    "numeric entities and unknown or malformed entities should have explicit behavior"
  );
  assert.equal(
    countReadableWords("Don&rsquo;t split contractions &copy; 2026"),
    4,
    "quote-like and spacing entities should preserve predictable word counts"
  );
  assert.equal(
    readableText("&lt;span&gt;Visible&lt;/span&gt;"),
    "Visible",
    "decoded tag-like entities should not leave markup in readable text"
  );
}

function assertRounding() {
  assert.equal(DEFAULT_WORDS_PER_MINUTE, 200);
  assert.deepEqual(estimateReadingTime(""), EMPTY_ESTIMATE);
  assert.deepEqual(estimateReadingTime("one two three"), {
    minutes: 1,
    label: "1 min read",
    wordCount: 3
  });
  assert.deepEqual(estimateReadingTime(words(200)), {
    minutes: 1,
    label: "1 min read",
    wordCount: 200
  });
  assert.deepEqual(estimateReadingTime(words(201)), {
    minutes: 2,
    label: "2 min read",
    wordCount: 201
  });
  assert.deepEqual(estimateReadingTime(words(4), { wordsPerMinute: 2 }), {
    minutes: 2,
    label: "2 min read",
    wordCount: 4
  });
  assert.deepEqual(estimateReadingTime(words(5), { wordsPerMinute: "2" }), {
    minutes: 3,
    label: "3 min read",
    wordCount: 5
  });

  for (const wordsPerMinute of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "abc"]) {
    assert.deepEqual(
      estimateReadingTime(words(201), { wordsPerMinute }),
      {
        minutes: 2,
        label: "2 min read",
        wordCount: 201
      },
      `${String(wordsPerMinute)} should fall back to the default reading speed`
    );
  }
}

function main() {
  assertEmptyInputs();
  assertPlainTextCounting();
  assertCjkCounting();
  assertMarkupSanitizer();
  assertEntityHandling();
  assertRounding();

  console.log("fkst-website dept=site tag=ok READING_TIME_UNIT");
}

main();
