"use strict";

const DEFAULT_LEVELS = new Set([2, 3, 4, 5, 6]);
const ENV_KEY = "__fkstHeadingAnchorState";

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

function normalizeHeadingText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function slugifyHeadingText(text) {
  const slug = normalizeHeadingText(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "section";
}

function plainTextFromInlineToken(token) {
  if (!token) {
    return "";
  }

  if (!Array.isArray(token.children) || token.children.length === 0) {
    return normalizeHeadingText(token.content);
  }

  return normalizeHeadingText(
    token.children
      .filter((child) => child.type !== "html_inline")
      .map((child) => child.content || "")
      .join("")
  );
}

function reserveHeadingId(baseId, usedIds) {
  const base = String(baseId || "section");
  let candidate = base;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function headingLevelFromTag(tag) {
  const match = String(tag || "").match(/^h([1-6])$/);
  return match ? Number(match[1]) : null;
}

function accessibleLabelFromHeadingText(text) {
  const headingText = normalizeHeadingText(text);
  return headingText ? `Link to ${headingText} section` : "Section link";
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

function getHeadingAnchorState(env) {
  if (!env[ENV_KEY]) {
    env[ENV_KEY] = {
      stack: [],
      usedIds: new Set(),
    };
  }
  return env[ENV_KEY];
}

function addHeadingAnchors(markdownLibrary, options = {}) {
  const levels = options.levels || DEFAULT_LEVELS;
  const { rules } = markdownLibrary.renderer;
  const renderHeadingOpen = rules.heading_open;
  const renderHeadingClose = rules.heading_close;

  markdownLibrary.core.ruler.push("heading_anchor_state", (state) => {
    state.env[ENV_KEY] = {
      stack: [],
      usedIds: new Set(),
    };
  });

  rules.heading_open = function (...args) {
    const [tokens, idx, optionsArg, env, self] = args;
    const token = tokens[idx];
    const state = getHeadingAnchorState(env);
    const level = headingLevelFromTag(token.tag);

    if (!levels.has(level)) {
      state.stack.push(null);
      return renderHeadingOpen
        ? renderHeadingOpen.apply(this, args)
        : self.renderToken(tokens, idx, optionsArg, env);
    }

    const inlineToken = tokens[idx + 1];
    const headingText = plainTextFromInlineToken(inlineToken);
    let id = token.attrGet("id");
    if (id) {
      state.usedIds.add(id);
    } else {
      id = reserveHeadingId(slugifyHeadingText(headingText), state.usedIds);
      token.attrSet("id", id);
    }

    token.attrJoin("class", "heading-anchor-target");
    state.stack.push({
      id,
      label: accessibleLabelFromHeadingText(headingText),
    });

    return renderHeadingOpen
      ? renderHeadingOpen.apply(this, args)
      : self.renderToken(tokens, idx, optionsArg, env);
  };

  rules.heading_close = function (...args) {
    const [tokens, idx, optionsArg, env, self] = args;
    const state = getHeadingAnchorState(env);
    const anchor = state.stack.pop();
    const html = renderHeadingClose
      ? renderHeadingClose.apply(this, args)
      : self.renderToken(tokens, idx, optionsArg, env);

    return anchor ? `${renderHeadingAnchor(anchor)}${html}` : html;
  };

  return markdownLibrary;
}

module.exports = {
  accessibleLabelFromHeadingText,
  addHeadingAnchors,
  normalizeHeadingAnchorProps,
  renderHeadingAnchor,
  slugifyHeadingText,
};
