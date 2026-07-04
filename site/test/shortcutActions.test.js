#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DOCS_SIDEBAR_PERSISTENCE_KEY,
  DOCS_SIDEBAR_SHORTCUT_ACTION,
  DOCS_SIDEBAR_SHORTCUT_ID,
  DOCS_SIDEBAR_SHORTCUT_KEYS,
  createDocsSidebarShortcutRegistration,
  shortcutActions,
  visibleShortcutActions,
} = require("../lib/shortcutActions");
const docsSidebarShortcut = require("../src/_data/docsSidebarShortcut");
const keyboardShortcuts = require("../src/_data/keyboardShortcuts");

test("docs sidebar shortcut scaffold exports inert owner registration metadata", () => {
  const registration = createDocsSidebarShortcutRegistration();

  assert.equal(DOCS_SIDEBAR_SHORTCUT_ID, "toggle-docs-sidebar");
  assert.equal(DOCS_SIDEBAR_SHORTCUT_KEYS, "Cmd/Ctrl+B");
  assert.equal(DOCS_SIDEBAR_PERSISTENCE_KEY, "fkst-docs-sidebar-open");
  assert.deepEqual(
    {
      enabled: registration.enabled,
      id: registration.id,
      keys: registration.keys,
      open: registration.open,
      storageKey: registration.storageKey,
    },
    {
      enabled: false,
      id: DOCS_SIDEBAR_SHORTCUT_ID,
      keys: DOCS_SIDEBAR_SHORTCUT_KEYS,
      open: false,
      storageKey: DOCS_SIDEBAR_PERSISTENCE_KEY,
    }
  );

  assert.doesNotThrow(() => registration.setOpen(true));
  assert.doesNotThrow(() => registration.toggle());
});

test("docs sidebar action is registered but hidden until behavior is implemented", () => {
  assert.equal(shortcutActions.includes(DOCS_SIDEBAR_SHORTCUT_ACTION), true);
  assert.equal(DOCS_SIDEBAR_SHORTCUT_ACTION.enabled, false);
  assert.equal(
    visibleShortcutActions().some((action) => action.id === DOCS_SIDEBAR_SHORTCUT_ID),
    false
  );
  assert.equal(
    keyboardShortcuts.items.some((action) => action.id === DOCS_SIDEBAR_SHORTCUT_ID),
    false
  );
  assert.equal(
    keyboardShortcuts.actions.some((action) => action.id === DOCS_SIDEBAR_SHORTCUT_ID),
    true
  );
});

test("docs sidebar data surface can initialize for the article shell without throwing", () => {
  assert.equal(docsSidebarShortcut.id, DOCS_SIDEBAR_SHORTCUT_ID);
  assert.equal(docsSidebarShortcut.keys, DOCS_SIDEBAR_SHORTCUT_KEYS);
  assert.equal(docsSidebarShortcut.storageKey, DOCS_SIDEBAR_PERSISTENCE_KEY);
  assert.equal(docsSidebarShortcut.enabled, false);
});
