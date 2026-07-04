const {
  shortcutActions,
  visibleShortcutActions,
} = require("../../lib/shortcutActions");

const items = visibleShortcutActions();

module.exports = {
  actions: shortcutActions,
  heading: "Keyboard shortcuts",
  summary: "A reference scaffold for site keyboard shortcuts.",
  items,
};
