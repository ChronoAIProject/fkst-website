"use strict";

const { parseTypedPost } = require("../../lib/posts");

function typedIndexPost(post, displayDate) {
  return Object.freeze({
    displayDate,
    post: parseTypedPost(post),
  });
}

const englishPosts = Object.freeze([
  typedIndexPost(
    {
      articleTitle: "Project news now has a clearer index surface",
      category: "news",
      description:
        "The site now separates pipeline announcements, releases, and deeper implementation notes so readers can scan update types quickly.",
      lang: "en",
      localeAlternates: {
        en: "/blog/project-news-clearer-index-surface/",
        zh: "/zh/blog/project-news-clearer-index-surface/",
      },
      localeCode: "en",
      permalink: "/blog/project-news-clearer-index-surface/",
      publishedDate: "2026-07-05",
      summary:
        "The site now separates pipeline announcements, releases, and deeper implementation notes so readers can scan update types quickly.",
      title: "Project news now has a clearer index surface | fkst",
    },
    "July 5, 2026"
  ),
  typedIndexPost(
    {
      articleTitle: "Website package updates continue through fkst",
      category: "release",
      description:
        "The website repository keeps its hand-authored site source separate from website-domain Lua packages while CI validates both surfaces.",
      lang: "en",
      localeAlternates: {
        en: "/blog/website-package-updates-through-fkst/",
        zh: "/zh/blog/website-package-updates-through-fkst/",
      },
      localeCode: "en",
      permalink: "/blog/website-package-updates-through-fkst/",
      publishedDate: "2026-07-05",
      summary:
        "The website repository keeps its hand-authored site source separate from website-domain Lua packages while CI validates both surfaces.",
      title: "Website package updates continue through fkst | fkst",
    },
    "July 5, 2026"
  ),
  typedIndexPost(
    {
      articleTitle: "Why the package boundary stays queue-only",
      category: "deep-dive",
      description:
        "Cross-repo composition remains explicit: packages integrate through qualified queues and pinned package roots instead of private imports.",
      lang: "en",
      localeAlternates: {
        en: "/blog/package-boundary-stays-queue-only/",
        zh: "/zh/blog/package-boundary-stays-queue-only/",
      },
      localeCode: "en",
      permalink: "/blog/package-boundary-stays-queue-only/",
      publishedDate: "2026-07-05",
      summary:
        "Cross-repo composition remains explicit: packages integrate through qualified queues and pinned package roots instead of private imports.",
      title: "Why the package boundary stays queue-only | fkst",
    },
    "July 5, 2026"
  ),
]);

const chinesePosts = Object.freeze([
  typedIndexPost(
    {
      articleTitle: "项目新闻现在有了更清晰的索引表面",
      category: "news",
      description: "站点现在区分流水线公告、发布记录和更深入的实现说明，让读者更快判断更新类型。",
      lang: "zh-Hans",
      localeAlternates: {
        en: "/blog/project-news-clearer-index-surface/",
        zh: "/zh/blog/project-news-clearer-index-surface/",
      },
      localeCode: "zh",
      permalink: "/zh/blog/project-news-clearer-index-surface/",
      publishedDate: "2026-07-05",
      summary: "站点现在区分流水线公告、发布记录和更深入的实现说明，让读者更快判断更新类型。",
      title: "项目新闻现在有了更清晰的索引表面 | fkst",
    },
    "2026-07-05"
  ),
  typedIndexPost(
    {
      articleTitle: "Website package 持续通过 fkst 更新",
      category: "release",
      description:
        "website 仓库继续把手写站点源码与 website 域 Lua package 分开，并由 CI 同时验证两类表面。",
      lang: "zh-Hans",
      localeAlternates: {
        en: "/blog/website-package-updates-through-fkst/",
        zh: "/zh/blog/website-package-updates-through-fkst/",
      },
      localeCode: "zh",
      permalink: "/zh/blog/website-package-updates-through-fkst/",
      publishedDate: "2026-07-05",
      summary:
        "website 仓库继续把手写站点源码与 website 域 Lua package 分开，并由 CI 同时验证两类表面。",
      title: "Website package 持续通过 fkst 更新 | fkst",
    },
    "2026-07-05"
  ),
  typedIndexPost(
    {
      articleTitle: "为什么 package 边界保持 queue-only",
      category: "deep-dive",
      description:
        "跨仓组合保持显式：package 通过限定名 queue 与 pinned package root 集成，而不是通过 private import。",
      lang: "zh-Hans",
      localeAlternates: {
        en: "/blog/package-boundary-stays-queue-only/",
        zh: "/zh/blog/package-boundary-stays-queue-only/",
      },
      localeCode: "zh",
      permalink: "/zh/blog/package-boundary-stays-queue-only/",
      publishedDate: "2026-07-05",
      summary:
        "跨仓组合保持显式：package 通过限定名 queue 与 pinned package root 集成，而不是通过 private import。",
      title: "为什么 package 边界保持 queue-only | fkst",
    },
    "2026-07-05"
  ),
]);

module.exports = Object.freeze({
  en: englishPosts,
  zh: chinesePosts,
});
