const DEFAULT_WORDS_PER_MINUTE = 200;
const CJK_CHARACTER_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[''][\p{L}\p{N}]+)*/gu;
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const HTML_ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]+);/g;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const NON_READING_BLOCK_PATTERN = /<(script|style)\b[\s\S]*?<\/\1\s*>/gi;

const NAMED_HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  copy: " ",
  gt: ">",
  hellip: " ",
  laquo: " ",
  ldquo: '"',
  lsquo: "'",
  lt: "<",
  mdash: " ",
  nbsp: " ",
  ndash: " ",
  quot: '"',
  raquo: " ",
  rdquo: '"',
  reg: " ",
  rsquo: "'",
  trade: " "
};

function decodeHtmlEntity(_match, entity) {
  if (entity.startsWith("#x") || entity.startsWith("#X")) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : " ";
  }

  if (entity.startsWith("#")) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : " ";
  }

  return NAMED_HTML_ENTITIES[entity.toLowerCase()] || " ";
}

function decodeHtmlEntities(content) {
  return content.replace(HTML_ENTITY_PATTERN, decodeHtmlEntity);
}

function stripUnreadableMarkup(content) {
  return content
    .replace(NON_READING_BLOCK_PATTERN, " ")
    .replace(HTML_COMMENT_PATTERN, " ")
    .replace(HTML_TAG_PATTERN, " ");
}

function readableText(content) {
  if (typeof content !== "string") {
    return "";
  }

  return stripUnreadableMarkup(decodeHtmlEntities(stripUnreadableMarkup(content)))
    .replace(/\s+/g, " ")
    .trim();
}

function countReadableWords(content) {
  const text = readableText(content);
  if (!text) {
    return 0;
  }

  const cjkCharacters = text.match(CJK_CHARACTER_PATTERN) || [];
  const textWithoutCjk = text.replace(CJK_CHARACTER_PATTERN, " ");
  const words = textWithoutCjk.match(WORD_PATTERN) || [];
  return cjkCharacters.length + words.length;
}

function estimateReadingTime(content, options = {}) {
  const requestedWordsPerMinute = Number(options.wordsPerMinute);
  const wordsPerMinute =
    Number.isFinite(requestedWordsPerMinute) && requestedWordsPerMinute > 0
      ? requestedWordsPerMinute
      : DEFAULT_WORDS_PER_MINUTE;
  const wordCount = countReadableWords(content);

  if (wordCount === 0) {
    return {
      minutes: 0,
      label: "Less than 1 min read",
      wordCount
    };
  }

  const minutes = Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  return {
    minutes,
    label: `${minutes} min read`,
    wordCount
  };
}

module.exports = {
  DEFAULT_WORDS_PER_MINUTE,
  countReadableWords,
  estimateReadingTime,
  readableText
};
