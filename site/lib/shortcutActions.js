"use strict";

/**
 * @typedef {Object} ShortcutAction
 * @property {string} id Stable action identifier.
 * @property {string} keys Human-readable shortcut sequence.
 * @property {string} label Visible action label.
 * @property {string} description Short action description.
 * @property {boolean} enabled Whether the shortcut is active in the current build.
 */

/**
 * @typedef {Object} DocsSidebarShortcutRegistration
 * @property {string} id Stable action identifier.
 * @property {string} keys Human-readable shortcut sequence.
 * @property {string} label Visible action label.
 * @property {string} description Short action description.
 * @property {boolean} enabled Whether docs sidebar shortcut handling is active.
 * @property {boolean} open Current docs sidebar open state supplied by the owner.
 * @property {string} storageKey Future persistence key for the owner state.
 * @property {(open: boolean) => void} setOpen Owner callback placeholder.
 * @property {() => void} toggle Owner toggle callback placeholder.
 */

const DOCS_SIDEBAR_SHORTCUT_ID = "toggle-docs-sidebar";
const DOCS_SIDEBAR_SHORTCUT_KEYS = "Cmd/Ctrl+B";
const DOCS_SIDEBAR_PERSISTENCE_KEY = "fkst-docs-sidebar-open";

const noop = () => {};

/** @type {ShortcutAction} */
const DOCS_SIDEBAR_SHORTCUT_ACTION = Object.freeze({
  id: DOCS_SIDEBAR_SHORTCUT_ID,
  keys: DOCS_SIDEBAR_SHORTCUT_KEYS,
  label: "Toggle docs sidebar",
  description: "Shows or hides the docs sidebar.",
  enabled: false,
});

/** @type {ShortcutAction[]} */
const shortcutActions = Object.freeze([
  Object.freeze({
    id: "open-shortcut-help",
    keys: "?",
    label: "Open keyboard shortcut help",
    description: "Shows this keyboard shortcut reference.",
    enabled: true,
  }),
  Object.freeze({
    id: "focus-primary-navigation",
    keys: "g n",
    label: "Focus primary navigation",
    description: "Moves focus to the primary site navigation.",
    enabled: true,
  }),
  Object.freeze({
    id: "return-to-top",
    keys: "g t",
    label: "Return to top",
    description: "Moves the page back to the top.",
    enabled: true,
  }),
  DOCS_SIDEBAR_SHORTCUT_ACTION,
]);

function visibleShortcutActions() {
  return shortcutActions.filter((action) => action.enabled);
}

/**
 * Build the behavior-neutral registration surface owned by the docs shell.
 *
 * @param {Partial<DocsSidebarShortcutRegistration>} [options]
 * @returns {DocsSidebarShortcutRegistration}
 */
function createDocsSidebarShortcutRegistration(options = {}) {
  return Object.freeze({
    ...DOCS_SIDEBAR_SHORTCUT_ACTION,
    enabled: options.enabled === true,
    open: options.open === true,
    storageKey: typeof options.storageKey === "string" && options.storageKey
      ? options.storageKey
      : DOCS_SIDEBAR_PERSISTENCE_KEY,
    setOpen: typeof options.setOpen === "function" ? options.setOpen : noop,
    toggle: typeof options.toggle === "function" ? options.toggle : noop,
  });
}

module.exports = {
  DOCS_SIDEBAR_PERSISTENCE_KEY,
  DOCS_SIDEBAR_SHORTCUT_ACTION,
  DOCS_SIDEBAR_SHORTCUT_ID,
  DOCS_SIDEBAR_SHORTCUT_KEYS,
  createDocsSidebarShortcutRegistration,
  shortcutActions,
  visibleShortcutActions,
};
