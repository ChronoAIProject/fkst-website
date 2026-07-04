"use strict";

const COPY_LABEL = "Copy code";
const IDLE_TEXT = "Copy";
const COPIED_TEXT = "Copied";
const COPY_FOUNDATION_PROVENANCE = Object.freeze({
  reviewedIssue: "#81",
  reviewedRef:
    "devloop/issue/ChronoAIProject/fkst-website/81/ready-consensus-github-devloop-issue-ChronoAIProject-fkst-website-81-2026-07-03T18-49-27Z-replay-loop-1-2821807451@685dae7",
  status: "absent",
  evidence:
    "The reviewed #81 tree contains no clipboard helper, no code-block copy renderer rule, and no data-code-block-copy selectors; this module is the single code-block copy scaffold in the current markdown rendering path.",
});

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
  COPY_FOUNDATION_PROVENANCE,
  wrapRenderedCodeBlock,
};
