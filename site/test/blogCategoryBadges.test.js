#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BLOG_CATEGORY_BADGES,
  blogCategoryBadgeData,
} = require("../lib/blogCategoryBadges");

test("blogCategoryBadgeData maps the approved taxonomy to canonical labels and icons", () => {
  assert.deepEqual(Object.keys(BLOG_CATEGORY_BADGES), [
    "news",
    "release",
    "deep-dive",
  ]);

  assert.deepEqual(blogCategoryBadgeData("news"), {
    iconHref: "/assets/img/blog-category-badges/news.svg",
    isKnown: true,
    label: "News",
    slug: "news",
  });
  assert.deepEqual(blogCategoryBadgeData("release"), {
    iconHref: "/assets/img/blog-category-badges/release.svg",
    isKnown: true,
    label: "Release",
    slug: "release",
  });
  assert.deepEqual(blogCategoryBadgeData("deep-dive"), {
    iconHref: "/assets/img/blog-category-badges/deep-dive.svg",
    isKnown: true,
    label: "Deep dive",
    slug: "deep-dive",
  });
});

test("blogCategoryBadgeData accepts category objects without changing known labels", () => {
  assert.deepEqual(blogCategoryBadgeData({ slug: "NEWS", label: "Latest" }), {
    iconHref: "/assets/img/blog-category-badges/news.svg",
    isKnown: true,
    label: "News",
    slug: "news",
  });
});

test("blogCategoryBadgeData degrades unknown and missing categories safely", () => {
  assert.deepEqual(blogCategoryBadgeData({ slug: "roadmap", label: "Roadmap" }), {
    iconHref: "",
    isKnown: false,
    label: "Roadmap",
    slug: "",
  });
  assert.deepEqual(blogCategoryBadgeData("roadmap"), {
    iconHref: "",
    isKnown: false,
    label: "roadmap",
    slug: "",
  });
  assert.equal(blogCategoryBadgeData(""), null);
  assert.equal(blogCategoryBadgeData(null), null);
});
