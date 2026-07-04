"use strict";

function escapeHtmlAttribute(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function normalizeHeadingAnchorProps(props = {}) {
  return {
    id: String(props.id || ""),
    label: String(props.label || "Section link"),
  };
}

function renderHeadingAnchor(props = {}) {
  const normalized = normalizeHeadingAnchorProps(props);
  if (!normalized.id) {
    return "";
  }

  return [
    `<a class="heading-anchor-link" href="#${escapeHtmlAttribute(normalized.id)}"`,
    ` aria-label="${escapeHtmlAttribute(normalized.label)}" data-heading-anchor>`,
    '<span class="heading-anchor-icon" aria-hidden="true">#</span>',
    "</a>",
  ].join("");
}

module.exports = {
  normalizeHeadingAnchorProps,
  renderHeadingAnchor,
};
