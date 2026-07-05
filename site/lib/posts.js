"use strict";

const POST_CONTRACT_VERSION = "post.v1";
const POST_SOURCE_FRONTMATTER = "frontmatter-yaml";
const POST_SOURCE_TYPED = "typed-schema";

const POST_SCHEMA = Object.freeze({
  contract: POST_CONTRACT_VERSION,
  required: Object.freeze({
    description: "non-empty string",
    lang: "non-empty string",
    localeCode: "supported locale code",
    permalink: "absolute site path",
    title: "non-empty string",
  }),
  optional: Object.freeze({
    articleEyebrow: "non-empty string",
    articleIntro: "non-empty string",
    articleTitle: "non-empty string",
    brandHref: "site path or URL string",
    category: "string slug or object with slug",
    footerHref: "site path or URL string",
    footerLabel: "non-empty string",
    footerText: "non-empty string",
    localeAlternates: "object with en and zh site paths",
    nav: "array of navigation items",
    publishedDate: "YYYY-MM-DD string",
    summary: "non-empty string",
  }),
});

class PostSchemaError extends Error {
  constructor(errors) {
    super(`Invalid post data: ${errors.join("; ")}`);
    this.name = "PostSchemaError";
    this.errors = Object.freeze([...errors]);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readRequiredString(input, field, errors, path = `post.${field}`) {
  const value = trimString(input[field]);
  if (!value) {
    errors.push(`${path} must be a non-empty string`);
  }
  return value;
}

function readOptionalString(input, field, errors, path = `post.${field}`) {
  const value = input[field];
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = trimString(value);
  if (!text) {
    errors.push(`${path} must be a non-empty string when present`);
    return undefined;
  }

  return text;
}

function normalizeCategory(value, errors) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    const slug = value.trim().toLowerCase();
    if (!slug) {
      errors.push("post.category must have a non-empty slug when present");
      return undefined;
    }
    return Object.freeze({ slug });
  }

  if (!isPlainObject(value)) {
    errors.push("post.category must be a string slug or object when present");
    return undefined;
  }

  const slug = readRequiredString(value, "slug", errors, "post.category.slug").toLowerCase();
  const label = readOptionalString(value, "label", errors, "post.category.label");
  if (!slug) {
    return undefined;
  }

  return Object.freeze(
    label
      ? {
          label,
          slug,
        }
      : { slug }
  );
}

function normalizeLocaleAlternates(value, errors) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    errors.push("post.localeAlternates must be an object when present");
    return undefined;
  }

  const en = readRequiredString(value, "en", errors, "post.localeAlternates.en");
  const zh = readRequiredString(value, "zh", errors, "post.localeAlternates.zh");
  if (!en || !zh) {
    return undefined;
  }

  return Object.freeze({ en, zh });
}

function normalizeNavItems(value, errors) {
  if (value === undefined || value === null) {
    return Object.freeze([]);
  }

  if (!Array.isArray(value)) {
    errors.push("post.nav must be an array when present");
    return Object.freeze([]);
  }

  const items = [];
  value.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`post.nav[${index}] must be an object`);
      return;
    }

    const label = readRequiredString(item, "label", errors, `post.nav[${index}].label`);
    const current = item.current === undefined ? false : item.current;
    if (typeof current !== "boolean") {
      errors.push(`post.nav[${index}].current must be a boolean when present`);
    }

    const href = readOptionalString(item, "href", errors, `post.nav[${index}].href`);
    if (!current && !href) {
      errors.push(`post.nav[${index}].href must be a non-empty string unless current is true`);
    }

    if (!label) {
      return;
    }

    const normalized = { label };
    if (href) {
      normalized.href = href;
    }
    if (current === true) {
      normalized.current = true;
    }
    items.push(Object.freeze(normalized));
  });

  return Object.freeze(items);
}

function normalizePublishedDate(value, errors) {
  if (value === undefined || value === null) {
    return undefined;
  }

  let text = "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    text = value.toISOString().slice(0, 10);
  } else {
    text = trimString(value);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    errors.push("post.publishedDate must be a YYYY-MM-DD string when present");
    return undefined;
  }

  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) {
    errors.push("post.publishedDate must be a real calendar date when present");
    return undefined;
  }

  return text;
}

function validatePermalink(value, errors) {
  if (value && !value.startsWith("/")) {
    errors.push("post.permalink must be an absolute site path");
  }
}

function validateLocaleCode(value, errors) {
  if (value && !["en", "zh"].includes(value)) {
    errors.push("post.localeCode must be one of: en, zh");
  }
}

function normalizePost(input, sourceFormat) {
  if (!isPlainObject(input)) {
    throw new PostSchemaError(["post must be an object"]);
  }

  const errors = [];
  const title = readRequiredString(input, "title", errors);
  const description = readRequiredString(input, "description", errors);
  const permalink = readRequiredString(input, "permalink", errors);
  const lang = readRequiredString(input, "lang", errors);
  const localeCode = readRequiredString(input, "localeCode", errors);
  validatePermalink(permalink, errors);
  validateLocaleCode(localeCode, errors);

  const articleTitle = readOptionalString(input, "articleTitle", errors) || title;
  const articleIntro = readOptionalString(input, "articleIntro", errors);
  const summary =
    readOptionalString(input, "summary", errors) ||
    articleIntro ||
    undefined;
  const publishedDate = normalizePublishedDate(
    input.publishedDate === undefined ? input.date : input.publishedDate,
    errors
  );

  const post = {
    contract: POST_CONTRACT_VERSION,
    sourceFormat,
    description,
    lang,
    localeCode,
    nav: normalizeNavItems(input.nav, errors),
    permalink,
    title,
  };

  post.articleTitle = articleTitle;

  const optionalStrings = [
    ["articleEyebrow", "articleEyebrow"],
    ["brandHref", "brandHref"],
    ["footerHref", "footerHref"],
    ["footerLabel", "footerLabel"],
    ["footerText", "footerText"],
  ];
  for (const [sourceField, outputField] of optionalStrings) {
    const value = readOptionalString(input, sourceField, errors);
    if (value) {
      post[outputField] = value;
    }
  }

  if (articleIntro) {
    post.articleIntro = articleIntro;
  }
  if (summary) {
    post.summary = summary;
  }
  if (publishedDate) {
    post.publishedDate = publishedDate;
  }

  const category = normalizeCategory(input.category, errors);
  if (category) {
    post.category = category;
  }

  const localeAlternates = normalizeLocaleAlternates(input.localeAlternates, errors);
  if (localeAlternates) {
    post.localeAlternates = localeAlternates;
  }

  if (errors.length) {
    throw new PostSchemaError(errors);
  }

  return Object.freeze(post);
}

function frontmatterPostInput(frontmatter) {
  if (!isPlainObject(frontmatter)) {
    return frontmatter;
  }

  const input = {
    articleEyebrow: frontmatter.articleEyebrow,
    articleIntro: frontmatter.articleIntro,
    articleTitle: frontmatter.articleTitle,
    brandHref: frontmatter.brandHref,
    description: frontmatter.description,
    footerHref: frontmatter.footerHref,
    footerLabel: frontmatter.footerLabel,
    footerText: frontmatter.footerText,
    lang: frontmatter.lang,
    layout: frontmatter.layout,
    localeAlternates: frontmatter.localeAlternates,
    localeCode: frontmatter.localeCode,
    nav: frontmatter.nav,
    permalink: frontmatter.permalink,
    summary: frontmatter.summary,
    title: frontmatter.title,
  };

  const category = frontmatter.category === undefined
    ? frontmatter.postCategory
    : frontmatter.category;
  if (category !== undefined) {
    input.category = category;
  }

  const publishedDate = frontmatter.publishedDate === undefined
    ? frontmatter.postDate
    : frontmatter.publishedDate;
  if (publishedDate !== undefined) {
    input.publishedDate = publishedDate;
  } else if (typeof frontmatter.date === "string") {
    input.publishedDate = frontmatter.date;
  }

  return input;
}

function parseTypedPost(input) {
  return normalizePost(input, POST_SOURCE_TYPED);
}

function parseFrontmatterPost(frontmatter) {
  return normalizePost(frontmatterPostInput(frontmatter), POST_SOURCE_FRONTMATTER);
}

function isFrontmatterPost(data) {
  if (!isPlainObject(data)) {
    return false;
  }

  return trimString(data.permalink).startsWith("/blog/");
}

function postFromEleventyData(data) {
  if (!isFrontmatterPost(data)) {
    return null;
  }

  return parseFrontmatterPost(data);
}

module.exports = {
  POST_CONTRACT_VERSION,
  POST_SCHEMA,
  POST_SOURCE_FRONTMATTER,
  POST_SOURCE_TYPED,
  PostSchemaError,
  parseFrontmatterPost,
  parseTypedPost,
  postFromEleventyData,
};
