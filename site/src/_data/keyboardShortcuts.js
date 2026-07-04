/**
 * @typedef {object} KeyboardShortcut
 * @property {string} id Stable identifier for tests and future key handling.
 * @property {string} keys Human-readable key sequence for the help overlay.
 * @property {string} label Visible action label.
 * @property {string} labelZhHans zh-Hans visible action label.
 * @property {string} description Short explanation of the action.
 * @property {string} descriptionZhHans zh-Hans short explanation of the action.
 */

/** @type {KeyboardShortcut[]} */
const items = [
  {
    id: "open-shortcut-help",
    keys: "?",
    label: "Open keyboard shortcut help",
    labelZhHans: "打开键盘快捷键帮助",
    description: "Shows this keyboard shortcut reference.",
    descriptionZhHans: "显示此键盘快捷键参考。",
  },
  {
    id: "focus-primary-navigation",
    keys: "g n",
    label: "Focus primary navigation",
    labelZhHans: "聚焦主导航",
    description: "Moves focus to the primary site navigation.",
    descriptionZhHans: "将焦点移到主站点导航。",
  },
  {
    id: "return-to-top",
    keys: "g t",
    label: "Return to top",
    labelZhHans: "返回顶部",
    description: "Moves the page back to the top.",
    descriptionZhHans: "将页面滚动回顶部。",
  },
];

module.exports = {
  eyebrow: "Keyboard help",
  eyebrowZhHans: "键盘帮助",
  heading: "Keyboard shortcuts",
  headingZhHans: "键盘快捷键",
  summary: "Press ? from anywhere outside editable fields to open this reference.",
  summaryZhHans: "在可编辑字段之外按 ? 打开此快捷键参考。",
  items,
};
