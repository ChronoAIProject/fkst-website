/**
 * @typedef {object} KeyboardShortcut
 * @property {string} id Stable identifier for tests and future key handling.
 * @property {string} keys Human-readable key sequence for the help overlay.
 * @property {string} label Visible action label.
 * @property {string} description Short explanation of the action.
 */

/** @type {KeyboardShortcut[]} */
const items = [
  {
    id: "open-shortcut-help",
    keys: "?",
    label: "Open keyboard shortcut help",
    description: "Shows this keyboard shortcut reference.",
  },
  {
    id: "focus-primary-navigation",
    keys: "g n",
    label: "Focus primary navigation",
    description: "Moves focus to the primary site navigation.",
  },
  {
    id: "return-to-top",
    keys: "g t",
    label: "Return to top",
    description: "Moves the page back to the top.",
  },
];

module.exports = {
  heading: "Keyboard shortcuts",
  summary: "A reference scaffold for site keyboard shortcuts.",
  items,
};
