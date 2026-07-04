"use strict";

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\n", "&#10;");
}

function languageFromInfo(info) {
  return String(info || "").trim().split(/\s+/)[0] || "";
}

function normalizeCodeBlockCopyProps(props = {}) {
  const info = String(props.info || "");
  return {
    text: String(props.text ?? ""),
    language: String(props.language ?? languageFromInfo(info)),
    info,
    kind: String(props.kind || "code_block"),
  };
}

function codeBlockCopyPropsFromToken(token, kind) {
  const info = typeof token?.info === "string" ? token.info : "";
  return normalizeCodeBlockCopyProps({
    text: typeof token?.content === "string" ? token.content : "",
    language: languageFromInfo(info),
    info,
    kind,
  });
}

function renderCopyControl() {
  return [
    '<button class="code-block-copy-button" type="button" data-code-block-copy-button disabled hidden>Copy</button>',
    '<span class="code-block-copy-status" data-code-block-copy-status aria-live="polite"></span>',
  ].join("");
}

function renderWrapperAttributes(props) {
  const normalized = normalizeCodeBlockCopyProps(props);
  return [
    'class="code-block-copy"',
    "data-code-block-copy",
    `data-code-block-copy-text="${escapeAttribute(normalized.text)}"`,
    `data-code-block-copy-language="${escapeAttribute(normalized.language)}"`,
    `data-code-block-copy-info="${escapeAttribute(normalized.info)}"`,
    `data-code-block-copy-kind="${escapeAttribute(normalized.kind)}"`,
  ].join(" ");
}

function wrapCodeBlock(html, props) {
  return `<div ${renderWrapperAttributes(props)}>${renderCopyControl()}${html}</div>`;
}

function addCodeBlockCopyControls(markdownLibrary) {
  const { rules } = markdownLibrary.renderer;
  const renderFence = rules.fence;
  const renderCodeBlock = rules.code_block;

  rules.fence = function (...args) {
    const token = args[0]?.[args[1]];
    return wrapCodeBlock(renderFence.apply(this, args), codeBlockCopyPropsFromToken(token, "fence"));
  };

  rules.code_block = function (...args) {
    const token = args[0]?.[args[1]];
    return wrapCodeBlock(renderCodeBlock.apply(this, args), codeBlockCopyPropsFromToken(token, "code_block"));
  };

  return markdownLibrary;
}

module.exports = {
  addCodeBlockCopyControls,
  codeBlockCopyPropsFromToken,
  normalizeCodeBlockCopyProps,
  wrapCodeBlock,
};
