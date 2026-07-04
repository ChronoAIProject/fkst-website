"use strict";

function renderCopyControl() {
  return [
    '<button class="code-block-copy-button" type="button" data-code-block-copy-button>Copy</button>',
    '<span class="code-block-copy-status" data-code-block-copy-status aria-live="polite"></span>',
  ].join("");
}

function wrapCodeBlock(html) {
  return `<div class="code-block-copy" data-code-block-copy>${renderCopyControl()}${html}</div>`;
}

function addCodeBlockCopyControls(markdownLibrary) {
  const { rules } = markdownLibrary.renderer;
  const renderFence = rules.fence;
  const renderCodeBlock = rules.code_block;

  rules.fence = function (...args) {
    return wrapCodeBlock(renderFence.apply(this, args));
  };

  rules.code_block = function (...args) {
    return wrapCodeBlock(renderCodeBlock.apply(this, args));
  };

  return markdownLibrary;
}

module.exports = {
  addCodeBlockCopyControls,
  wrapCodeBlock,
};
