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
const KEYBOARD_SHORTCUTS = require("../src/_data/keyboardShortcuts");

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("docs sidebar shortcut scaffold stays owner-local and inert", () => {
  const template = readUtf8(TEMPLATE_PATH);

  assert.match(template, /data-docs-sidebar-shortcut-scaffold/);
  assert.match(template, /data-shortcut-action-id="toggle-docs-sidebar"/);
  assert.match(template, /data-shortcut-keys="Cmd\/Ctrl\+B"/);
  assert.match(template, /data-shortcut-enabled="false"/);
  assert.doesNotMatch(template, /storage|setOpen|toggle\(/);
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
