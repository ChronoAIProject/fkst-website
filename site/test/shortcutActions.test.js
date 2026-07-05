#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const SITE_ROOT = path.join(ROOT, "site");
const COMPONENT_PATH = path.join(SITE_ROOT, "src", "_includes", "components", "DocsSidebar.njk");
const SCAFFOLD_PATH = path.join(
  SITE_ROOT,
  "src",
  "_includes",
  "components",
  "DocsSidebarShortcutScaffold.njk"
);
const ARTICLE_LAYOUT_PATH = path.join(SITE_ROOT, "src", "_includes", "layouts", "article.njk");
const ARTICLE_SHELL_PATH = path.join(SITE_ROOT, "src", "_includes", "components", "ArticleShell.njk");
const ARTICLE_CONTENT_PATH = path.join(SITE_ROOT, "src", "_includes", "components", "ArticleContent.njk");
const ARTICLE_SCRIPTS_PATH = path.join(SITE_ROOT, "src", "_includes", "components", "ArticleScripts.njk");
const SCRIPT_PATH = path.join(SITE_ROOT, "src", "assets", "js", "docs-sidebar.js");
const SOURCE_ROOT = path.join(SITE_ROOT, "src");
const KEYBOARD_SHORTCUTS = require("../src/_data/keyboardShortcuts");

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function siteSourceFiles() {
  const pending = [SOURCE_ROOT];
  const files = [];

  while (pending.length > 0) {
    const currentPath = pending.pop();
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files.sort();
}

test("article pages own the docs sidebar at the article shell boundary", () => {
  const articleLayout = readUtf8(ARTICLE_LAYOUT_PATH);
  const articleShell = readUtf8(ARTICLE_SHELL_PATH);
  const articleContent = readUtf8(ARTICLE_CONTENT_PATH);
  const articleScripts = readUtf8(ARTICLE_SCRIPTS_PATH);
  const component = readUtf8(COMPONENT_PATH);
  const articlePages = siteSourceFiles().filter((filePath) => {
    if (filePath.includes(`${path.sep}_includes${path.sep}`)) {
      return false;
    }
    return /^layout:\s*layouts\/article\.njk$/m.test(readUtf8(filePath));
  });

  assert.deepEqual(
    articlePages.map((filePath) => path.relative(SITE_ROOT, filePath)),
    [
      "src/architecture.njk",
      "src/doctrine.njk",
      "src/zh/architecture.njk",
      "src/zh/doctrine.njk",
    ]
  );
  assert.equal(fs.existsSync(SCAFFOLD_PATH), false);
  assert.match(articleLayout, /components\/ArticleShell\.njk/);
  assert.match(articleShell, /components\/DocsSidebar\.njk/);
  assert.match(articleShell, /data-docs-sidebar-shell/);
  assert.match(articleContent, /data-docs-sidebar-content/);
  assert.match(articleScripts, /data-docs-sidebar-script/);
  assert.match(component, /<aside[\s\S]*data-docs-sidebar/);
  assert.match(component, /aria-controls="docs-sidebar-panel"/);
  assert.match(component, /aria-expanded="true"/);
  assert.match(component, /data-docs-sidebar-list/);
  assert.doesNotMatch(component, /data-shortcut-enabled="false"/);
});

test("docs sidebar behavior stays owner-local without a shared action registry", () => {
  const script = readUtf8(SCRIPT_PATH);
  const forbiddenPaths = [
    path.join(SITE_ROOT, "lib", "shortcutActions.js"),
    path.join(SITE_ROOT, "src", "_data", "docsSidebarShortcut.js"),
  ];

  assert.match(script, /fkst-docs-sidebar/);
  assert.match(script, /data-docs-sidebar-state/);
  assert.match(script, /localStorage/);
  assert.match(script, /event\.metaKey/);
  assert.match(script, /event\.ctrlKey/);
  assert.match(script, /isContentEditable/);
  assert.match(script, /input, textarea, select/);

  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(fs.existsSync(forbiddenPath), false, forbiddenPath);
  }
});

test("shortcut help metadata advertises the real docs sidebar shortcut", () => {
  const shortcut = KEYBOARD_SHORTCUTS.items.find((item) => item.id === "toggle-docs-sidebar");

  assert.deepEqual(shortcut, {
    id: "toggle-docs-sidebar",
    keys: "Cmd/Ctrl+B",
    label: "Toggle docs sidebar",
    description: "Shows or hides the article section sidebar.",
  });
  assert.equal(Object.hasOwn(KEYBOARD_SHORTCUTS, "actions"), false);
});
