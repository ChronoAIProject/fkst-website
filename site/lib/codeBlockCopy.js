"use strict";

const COPY_LABEL = "Copy code";
const IDLE_TEXT = "Copy";
const COPIED_TEXT = "Copied";

function wrapRenderedCodeBlock(renderedCodeBlock) {
  return [
    '<div class="code-block-copy" data-code-block-copy data-code-block-copy-state="idle">',
    '<button class="code-block-copy__button" type="button" data-code-block-copy-button aria-label="',
    COPY_LABEL,
    '" disabled>',
    '<span data-code-block-copy-label>',
    IDLE_TEXT,
    "</span>",
    "</button>",
    '<span class="code-block-copy__status" data-code-block-copy-status role="status" aria-live="polite" hidden>',
    COPIED_TEXT,
    "</span>",
    renderedCodeBlock,
    "</div>\n",
  ].join("");
}

function decorateRule(markdownLibrary, ruleName) {
  const originalRule = markdownLibrary.renderer.rules[ruleName];
  if (typeof originalRule !== "function") {
    return;
  }

  markdownLibrary.renderer.rules[ruleName] = function renderCodeBlockWithCopyControl(
    tokens,
    index,
    options,
    env,
    self
  ) {
    const renderedCodeBlock = originalRule.call(this, tokens, index, options, env, self);
    return wrapRenderedCodeBlock(renderedCodeBlock);
  };
}

function addCodeBlockCopyControls(markdownLibrary) {
  if (!markdownLibrary || !markdownLibrary.renderer || !markdownLibrary.renderer.rules) {
    throw new Error("markdown-it renderer is required for code block copy controls");
  }

  decorateRule(markdownLibrary, "fence");
  decorateRule(markdownLibrary, "code_block");
  return markdownLibrary;
}

module.exports = {
  addCodeBlockCopyControls,
  wrapRenderedCodeBlock,
};
