const DEFAULT_WORDS_PER_MINUTE = 200;
const CJK_CHARACTER_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[''][\p{L}\p{N}]+)*/gu;

function readableText(content) {
  if (typeof content !== "string") {
    return "";
  }

  return content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z0-9#]+;/g, " ")
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
  estimateReadingTime
};
