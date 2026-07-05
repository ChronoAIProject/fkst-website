"use strict";

const BLOG_CATEGORY_BADGES = Object.freeze({
  news: Object.freeze({
    slug: "news",
    label: "News",
    iconHref: "/assets/img/blog-category-badges/news.svg",
  }),
  release: Object.freeze({
    slug: "release",
    label: "Release",
    iconHref: "/assets/img/blog-category-badges/release.svg",
  }),
  "deep-dive": Object.freeze({
    slug: "deep-dive",
    label: "Deep dive",
    iconHref: "/assets/img/blog-category-badges/deep-dive.svg",
  }),
});

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function categoryKey(category) {
  if (typeof category === "string") {
    return category.trim().toLowerCase();
  }

  if (!category || typeof category !== "object") {
    return "";
  }

  for (const field of ["slug", "key", "id", "category"]) {
    const value = stringValue(category[field]);
    if (value) {
      return value.toLowerCase();
    }
  }

  return "";
}

function fallbackLabel(category, key) {
  if (category && typeof category === "object") {
    for (const field of ["label", "title", "name"]) {
      const value = stringValue(category[field]);
      if (value) {
        return value;
      }
    }
  }

  if (typeof category === "string") {
    return category.trim();
  }

  return key;
}

function blogCategoryBadgeData(category) {
  const key = categoryKey(category);
  if (!key) {
    return null;
  }

  const badge = BLOG_CATEGORY_BADGES[key];
  if (badge) {
    return {
      iconHref: badge.iconHref,
      isKnown: true,
      label: badge.label,
      slug: badge.slug,
    };
  }

  const label = fallbackLabel(category, key);
  if (!label) {
    return null;
  }

  return {
    iconHref: "",
    isKnown: false,
    label,
    slug: "",
  };
}

module.exports = {
  BLOG_CATEGORY_BADGES,
  blogCategoryBadgeData,
};
