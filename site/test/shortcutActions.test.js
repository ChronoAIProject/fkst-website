#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const SITE_ROOT = path.join(ROOT, "site");
const TEMPLATE_PATH = path.join(
  SITE_ROOT,
  "src",
  "_includes",
  "components",
  "DocsSidebarShortcutScaffold.njk"
);
const ARTICLE_LAYOUT_PATH = path.join(SITE_ROOT, "src", "_includes", "layouts", "article.njk");
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

test("docs sidebar shortcut scaffold stays owner-local and inert", () => {
  const template = readUtf8(TEMPLATE_PATH);

  assert.match(template, /data-docs-sidebar-shortcut-scaffold/);
  assert.match(template, /data-shortcut-action-id="toggle-docs-sidebar"/);
  assert.match(template, /data-shortcut-keys="Cmd\/Ctrl\+B"/);
  assert.match(template, /data-shortcut-enabled="false"/);
  assert.doesNotMatch(template, /storage|setOpen|toggle\(/);
});

test("docs sidebar shortcut scaffold is wired at the current article shell boundary", () => {
  const articleLayout = readUtf8(ARTICLE_LAYOUT_PATH);
  const articlePages = siteSourceFiles().filter((filePath) => {
    if (filePath.includes(`${path.sep}_includes${path.sep}`)) {
      return false;
    }
    return /^layout:\s*layouts\/article\.njk$/m.test(readUtf8(filePath));
  });
  const sidebarOwners = siteSourceFiles().filter((filePath) => {
    if (filePath === TEMPLATE_PATH || filePath === ARTICLE_LAYOUT_PATH) {
      return false;
    }
    return /sidebar|docs-sidebar|docsSidebar/i.test(readUtf8(filePath));
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
  assert.deepEqual(sidebarOwners, []);
  assert.match(articleLayout, /Source audit in shortcutActions\.test\.js/);
  assert.match(articleLayout, /components\/DocsSidebarShortcutScaffold\.njk/);
});

test("shortcut help metadata is not widened for the docs sidebar scaffold", () => {
  assert.equal(
    KEYBOARD_SHORTCUTS.items.some((shortcut) => shortcut.id === "toggle-docs-sidebar"),
    false
  );
  assert.equal(Object.hasOwn(KEYBOARD_SHORTCUTS, "actions"), false);
});

test("docs sidebar shortcut scaffold does not add a shared action registry", () => {
  const forbiddenPaths = [
    path.join(SITE_ROOT, "lib", "shortcutActions.js"),
    path.join(SITE_ROOT, "src", "_data", "docsSidebarShortcut.js"),
  ];

  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(fs.existsSync(forbiddenPath), false, forbiddenPath);
  }
});
