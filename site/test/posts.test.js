#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  POST_CONTRACT_VERSION,
  POST_SOURCE_FRONTMATTER,
  POST_SOURCE_TYPED,
  PostSchemaError,
  parseFrontmatterPost,
  parseTypedPost,
  postFromEleventyData,
} = require("../lib/posts");

function assertErrorSet(actual, expected) {
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

function validTypedPost(overrides = {}) {
  return {
    articleEyebrow: "Release",
    articleIntro: "A focused summary for the blog card and article header.",
    articleTitle: "Typed post contract lands",
    brandHref: "/",
    category: { slug: "release", label: "Release notes" },
    description: "Contract test fixture for typed post data.",
    footerHref: "/blog.html",
    footerLabel: "Back to blog",
    lang: "en",
    localeAlternates: {
      en: "/blog/typed-post/",
      zh: "/zh/blog/typed-post/",
    },
    localeCode: "en",
    nav: [
      { label: "Home", href: "/" },
      { label: "Blog", current: true },
    ],
    permalink: "/blog/typed-post/",
    publishedDate: "2026-07-05",
    title: "Typed Post | fkst",
    ...overrides,
  };
}

test("parseTypedPost accepts valid post data and exposes the internal contract", () => {
  const post = parseTypedPost(validTypedPost());

  assert.equal(post.contract, POST_CONTRACT_VERSION);
  assert.equal(post.sourceFormat, POST_SOURCE_TYPED);
  assert.equal(post.title, "Typed Post | fkst");
  assert.equal(post.articleTitle, "Typed post contract lands");
  assert.equal(post.summary, "A focused summary for the blog card and article header.");
  assert.deepEqual(post.category, {
    label: "Release notes",
    slug: "release",
  });
  assert.deepEqual(post.nav, [
    { label: "Home", href: "/" },
    { label: "Blog", current: true },
  ]);
});

test("parseTypedPost rejects invalid required fields with narrow errors", () => {
  assert.throws(
    () =>
      parseTypedPost(
        validTypedPost({
          description: "",
          localeCode: "fr",
          permalink: "blog/missing-leading-slash/",
          title: " ",
        })
      ),
    (error) => {
      assert.ok(error instanceof PostSchemaError);
      assertErrorSet(error.errors, [
        "post.title must be a non-empty string",
        "post.permalink must be an absolute site path",
        "post.localeCode must be one of: en, zh",
        "post.description must be a non-empty string",
      ]);
      return true;
    }
  );
});

test("parseTypedPost rejects invalid optional typed fields when they are present", () => {
  assert.throws(
    () =>
      parseTypedPost(
        validTypedPost({
          category: { label: "Missing slug" },
          nav: [{ label: "Broken" }],
          publishedDate: "2026-02-31",
        })
      ),
    (error) => {
      assert.ok(error instanceof PostSchemaError);
      assertErrorSet(error.errors, [
        "post.publishedDate must be a real calendar date when present",
        "post.category.slug must be a non-empty string",
        "post.nav[0].href must be a non-empty string unless current is true",
      ]);
      return true;
    }
  );
});

test("parseFrontmatterPost adapts legacy frontmatter YAML-shaped data", () => {
  const post = parseFrontmatterPost({
    articleEyebrow: "Blog smoke",
    articleIntro: "Fixture article for the legacy frontmatter path.",
    articleTitle: "Legacy frontmatter post",
    brandHref: "/",
    description: "Legacy frontmatter fixture.",
    footerText: "Smoke fixture",
    lang: "en",
    layout: "layouts/article.njk",
    localeCode: "en",
    nav: [],
    permalink: "/blog/legacy-frontmatter/",
    postCategory: "news",
    postDate: "2026-07-05",
    title: "Legacy Frontmatter | fkst",
  });

  assert.equal(post.contract, POST_CONTRACT_VERSION);
  assert.equal(post.sourceFormat, POST_SOURCE_FRONTMATTER);
  assert.equal(post.articleTitle, "Legacy frontmatter post");
  assert.equal(post.publishedDate, "2026-07-05");
  assert.deepEqual(post.category, { slug: "news" });
  assert.deepEqual(post.nav, []);
});

test("postFromEleventyData leaves non-blog pages outside the post contract", () => {
  assert.equal(
    postFromEleventyData({
      layout: "layouts/article.njk",
      permalink: "/architecture.html",
      title: "Architecture | fkst",
    }),
    null
  );
});

test("postFromEleventyData normalizes frontmatter-backed blog posts", () => {
  const post = postFromEleventyData({
    articleIntro: "Fixture article for Eleventy data normalization.",
    brandHref: "/",
    description: "Eleventy data fixture.",
    lang: "en",
    layout: "layouts/article.njk",
    localeCode: "en",
    nav: [],
    permalink: "/blog/eleventy-frontmatter/",
    title: "Eleventy Frontmatter | fkst",
  });

  assert.equal(post.sourceFormat, POST_SOURCE_FRONTMATTER);
  assert.equal(post.articleTitle, "Eleventy Frontmatter | fkst");
  assert.equal(post.summary, "Fixture article for Eleventy data normalization.");
});
