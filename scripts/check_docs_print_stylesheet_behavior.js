#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const ROOT = path.resolve(__dirname, "..");
const SITE_ROOT = path.join(ROOT, "site");
const STYLE_OUTPUT = path.join(SITE_ROOT, "_site", "assets", "css", "style.css");
const siteRequire = createRequire(path.join(SITE_ROOT, "package.json"));
const { JSDOM } = siteRequire("jsdom");

const PRINT_MEDIA = "print";
const STYLE_RULE = 1;
const MEDIA_RULE = 4;

function fixtureMarkup() {
  const longCodeLine = "const payload = '" + "x".repeat(180) + "';";

  return `<!doctype html>
<html>
  <body>
    <header class="site-header">
      <a id="header-chrome-link" href="https://example.invalid/header">Brand</a>
      <nav class="top-nav"><a id="nav-chrome-link" href="https://example.invalid/nav">Docs</a></nav>
      <div class="header-actions">
        <nav class="locale-switcher"><a href="/zh/">中文</a></nav>
        <span class="theme-toggle-control"><button type="button">Theme</button></span>
        <span class="print-page-control"><button type="button">Print</button></span>
      </div>
    </header>
    <main>
      <div class="article-scroll-progress"></div>
      <section class="page-header article-header">
        <h1>Printable docs</h1>
        <p class="page-intro">Intro with a <a id="header-absolute-link" href="https://example.invalid/reference">reference</a>.</p>
        <a id="header-relative-link" href="/reference/">Relative reference</a>
        <a id="header-fragment-link" href="#summary">Fragment reference</a>
        <a id="header-empty-link" href="">Empty reference</a>
      </section>
      <div class="article-shell" data-docs-sidebar-state="closed">
        <aside class="docs-sidebar">
          <button class="docs-sidebar-toggle" type="button">Sidebar</button>
          <nav><a id="sidebar-link" href="https://example.invalid/sidebar">Sidebar link</a></nav>
        </aside>
        <article class="page-content">
          <h2 id="summary">Summary <a id="heading-anchor" class="heading-anchor-link" href="#summary">#</a></h2>
          <h3>Details</h3>
          <p>Readable paragraph with an <a id="content-absolute-link" href="https://example.invalid/content">absolute link</a>.</p>
          <p>Readable paragraph with a <a id="content-relative-link" href="../relative/">relative link</a>.</p>
          <p>Readable paragraph with a <a id="content-fragment-link" href="#summary">fragment link</a>.</p>
          <p>Readable paragraph with a <a id="content-empty-link" href="">empty link</a>.</p>
          <ul><li>Readable list item.</li></ul>
          <dl><dt>Term</dt><dd>Definition.</dd></dl>
          <blockquote>Readable quote.</blockquote>
          <div class="code-block-copy">
            <button class="code-block-copy-button" type="button">Copy</button>
            <span class="code-block-copy-status">Copied</span>
            <pre id="wrapped-code"><code>${longCodeLine}</code></pre>
          </div>
          <pre id="plain-pre">${longCodeLine}</pre>
        </article>
      </div>
      <section class="repo-actions">
        <a id="repo-link" href="https://example.invalid/repo">Repository</a>
      </section>
    </main>
    <footer class="site-footer"><a id="footer-chrome-link" href="https://example.invalid/footer">Footer</a></footer>
    <button class="back-to-top-button" type="button">Top</button>
    <span class="external-link-marker"></span>
    <dialog class="keyboard-shortcut-overlay">
      <section class="keyboard-shortcut-panel">
        <button class="keyboard-shortcut-close" type="button">Close</button>
      </section>
    </dialog>
  </body>
</html>`;
}

function parsePrintRules(cssText) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
  const { document } = dom.window;
  const style = document.createElement("style");
  style.textContent = cssText;
  document.head.append(style);

  const rules = [];
  for (const rule of Array.from(style.sheet.cssRules)) {
    if (rule.type === MEDIA_RULE && rule.conditionText.trim() === PRINT_MEDIA) {
      for (const mediaRule of Array.from(rule.cssRules)) {
        if (mediaRule.type === STYLE_RULE && !mediaRule.selectorText.trim().startsWith("@")) {
          rules.push(mediaRule);
        }
      }
    }
  }
  return rules;
}

function selectorParts(selectorText) {
  const selectors = [];
  let start = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let quote = null;

  for (let index = 0; index < selectorText.length; index += 1) {
    const char = selectorText[index];
    const previous = selectorText[index - 1];

    if (quote !== null) {
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      continue;
    }
    if (char === "]") {
      bracketDepth -= 1;
      continue;
    }
    if (char === "(") {
      parenDepth += 1;
      continue;
    }
    if (char === ")") {
      parenDepth -= 1;
      continue;
    }
    if (char === "," && bracketDepth === 0 && parenDepth === 0) {
      selectors.push(selectorText.slice(start, index).trim());
      start = index + 1;
    }
  }

  selectors.push(selectorText.slice(start).trim());
  return selectors.filter(Boolean);
}

function addSpecificity(left, right) {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2]
  ];
}

function compareSpecificity(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function maxSpecificity(left, right) {
  return compareSpecificity(left, right) >= 0 ? left : right;
}

function consumeIdentifier(text, start) {
  let index = start;
  while (index < text.length && /[A-Za-z0-9_-]/.test(text[index])) {
    index += 1;
  }
  return index;
}

function consumeBalanced(text, start, openChar, closeChar) {
  let depth = 0;
  let quote = null;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];

    if (quote !== null) {
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return text.length;
}

function selectorListSpecificity(selectorText) {
  return selectorParts(selectorText)
    .map((selector) => selectorSpecificity(selector))
    .reduce(maxSpecificity, [0, 0, 0]);
}

function selectorSpecificity(selector) {
  let specificity = [0, 0, 0];

  for (let index = 0; index < selector.length;) {
    const char = selector[index];

    if (char === "#") {
      specificity[0] += 1;
      index = consumeIdentifier(selector, index + 1);
      continue;
    }

    if (char === ".") {
      specificity[1] += 1;
      index = consumeIdentifier(selector, index + 1);
      continue;
    }

    if (char === "[") {
      specificity[1] += 1;
      index = consumeBalanced(selector, index, "[", "]");
      continue;
    }

    if (char === ":") {
      if (selector[index + 1] === ":") {
        specificity[2] += 1;
        index = consumeIdentifier(selector, index + 2);
        continue;
      }

      const nameStart = index + 1;
      const nameEnd = consumeIdentifier(selector, nameStart);
      const pseudoName = selector.slice(nameStart, nameEnd).toLowerCase();

      if (selector[nameEnd] === "(") {
        const argsEnd = consumeBalanced(selector, nameEnd, "(", ")");
        const args = selector.slice(nameEnd + 1, argsEnd - 1);
        if (pseudoName === "not" || pseudoName === "is" || pseudoName === "has") {
          specificity = addSpecificity(specificity, selectorListSpecificity(args));
        } else if (pseudoName !== "where") {
          specificity[1] += 1;
        }
        index = argsEnd;
        continue;
      }

      specificity[1] += 1;
      index = nameEnd;
      continue;
    }

    if (/[A-Za-z_-]/.test(char)) {
      specificity[2] += 1;
      index = consumeIdentifier(selector, index + 1);
      continue;
    }

    index += 1;
  }

  return specificity;
}

function splitPseudoElement(selector) {
  const match = selector.match(/::[A-Za-z0-9_-]+$/);
  if (!match) {
    return { baseSelector: selector, pseudoElement: null };
  }
  return {
    baseSelector: selector.slice(0, match.index),
    pseudoElement: match[0]
  };
}

function matchesSelector(element, selector) {
  const { baseSelector } = splitPseudoElement(selector);
  if (!baseSelector) {
    return false;
  }
  return element.matches(baseSelector);
}

function matchingRuleSpecificity(element, rule, pseudoElement = null) {
  let specificity = null;

  for (const selector of selectorParts(rule.selectorText)) {
    const selectorPseudo = splitPseudoElement(selector).pseudoElement;
    if (pseudoElement === null && selectorPseudo !== null) {
      continue;
    }
    if (pseudoElement !== null && selectorPseudo !== pseudoElement) {
      continue;
    }
    if (!matchesSelector(element, selector)) {
      continue;
    }
    const selectorScore = selectorSpecificity(selector);
    specificity = specificity === null
      ? selectorScore
      : maxSpecificity(specificity, selectorScore);
  }

  return specificity;
}

function shouldApplyDeclaration(current, candidate) {
  if (current === undefined) {
    return true;
  }

  if (current.priority !== candidate.priority) {
    return candidate.priority === "important";
  }

  const specificityComparison = compareSpecificity(candidate.specificity, current.specificity);
  if (specificityComparison !== 0) {
    return specificityComparison > 0;
  }

  return candidate.sourceOrder >= current.sourceOrder;
}

function declarationsFor(element, rules, pseudoElement = null) {
  const declarations = new Map();

  for (let sourceOrder = 0; sourceOrder < rules.length; sourceOrder += 1) {
    const rule = rules[sourceOrder];
    const specificity = matchingRuleSpecificity(element, rule, pseudoElement);
    if (specificity === null) {
      continue;
    }

    for (let index = 0; index < rule.style.length; index += 1) {
      const property = rule.style[index];
      const candidate = {
        priority: rule.style.getPropertyPriority(property),
        sourceOrder,
        specificity,
        value: rule.style.getPropertyValue(property).trim()
      };
      if (shouldApplyDeclaration(declarations.get(property), candidate)) {
        declarations.set(property, candidate);
      }
    }
  }

  return declarations;
}

function valueFor(element, rules, property, pseudoElement = null) {
  return declarationsFor(element, rules, pseudoElement).get(property)?.value ?? "";
}

function priorityFor(element, rules, property, pseudoElement = null) {
  return declarationsFor(element, rules, pseudoElement).get(property)?.priority ?? "";
}

function assertDeclaration(element, rules, property, expected, pseudoElement = null) {
  assert.equal(
    valueFor(element, rules, property, pseudoElement),
    expected,
    `${elementDescription(element)} should resolve print ${property} to ${expected}`
  );
}

function assertImportantDeclaration(element, rules, property, expected) {
  assertDeclaration(element, rules, property, expected);
  assert.equal(
    priorityFor(element, rules, property),
    "important",
    `${elementDescription(element)} should mark print ${property} as important`
  );
}

function elementDescription(element) {
  if (element.id) {
    return `#${element.id}`;
  }
  if (element.className) {
    return `.${String(element.className).trim().split(/\s+/).join(".")}`;
  }
  return element.localName;
}

function element(document, selector) {
  const match = document.querySelector(selector);
  assert.ok(match, `fixture should contain ${selector}`);
  return match;
}

function assertHiddenChrome(document, rules) {
  const chromeSelectors = [
    ".site-header",
    ".top-nav",
    ".header-actions",
    ".locale-switcher",
    ".theme-toggle-control",
    ".print-page-control",
    ".site-footer",
    ".article-scroll-progress",
    ".docs-sidebar",
    ".docs-sidebar-toggle",
    ".back-to-top-button",
    ".code-block-copy-button",
    ".code-block-copy-status",
    ".keyboard-shortcut-overlay",
    ".keyboard-shortcut-panel",
    ".keyboard-shortcut-close",
    ".heading-anchor-link",
    ".external-link-marker",
    ".repo-actions"
  ];

  for (const selector of chromeSelectors) {
    assertImportantDeclaration(element(document, selector), rules, "display", "none");
  }
}

function assertReadableContent(document, rules) {
  const darkTextSelectors = [
    "body",
    ".article-shell",
    ".page-header",
    ".page-content",
    "h1",
    "h2",
    "h3",
    ".page-content p",
    "li",
    "dt",
    "dd",
    "blockquote"
  ];

  for (const selector of darkTextSelectors) {
    assertImportantDeclaration(element(document, selector), rules, "color", "#111111");
  }

  const whiteBackgroundSelectors = [
    "body",
    ".article-shell",
    ".page-header",
    ".page-content"
  ];

  for (const selector of whiteBackgroundSelectors) {
    assertImportantDeclaration(element(document, selector), rules, "background", "#ffffff");
  }
}

function assertFlattenedLayout(document, rules) {
  const shell = element(document, ".article-shell");
  assertDeclaration(shell, rules, "display", "block");
  assertDeclaration(shell, rules, "gap", "0");
  assertDeclaration(shell, rules, "grid-template-columns", "none");

  const fullWidthSelectors = [
    "main",
    ".page-header",
    ".article-header",
    ".article-shell",
    ".page-content"
  ];

  for (const selector of fullWidthSelectors) {
    const match = element(document, selector);
    assertDeclaration(match, rules, "margin", "0");
    assertDeclaration(match, rules, "max-width", "none");
    assertDeclaration(match, rules, "padding", "0");
    assertDeclaration(match, rules, "width", "100%");
  }

  assertDeclaration(element(document, ".page-content"), rules, "display", "block");
  assertDeclaration(element(document, ".page-content"), rules, "gap", "0");
}

function assertLinkUrlPrinting(document, rules) {
  const linksWithPrintedUrls = [
    "#header-absolute-link",
    "#header-relative-link",
    "#content-absolute-link",
    "#content-relative-link"
  ];

  for (const selector of linksWithPrintedUrls) {
    const link = element(document, selector);
    assertDeclaration(link, rules, "content", "\" (\" attr(href) \")\"", "::after");
    assertDeclaration(link, rules, "overflow-wrap", "anywhere", "::after");
    assertDeclaration(link, rules, "word-break", "break-word", "::after");
  }

  const linksWithoutPrintedUrls = [
    "#header-fragment-link",
    "#header-empty-link",
    "#content-fragment-link",
    "#content-empty-link",
    "#heading-anchor"
  ];

  for (const selector of linksWithoutPrintedUrls) {
    assertNoPrintedUrl(element(document, selector), rules, selector);
  }

  const chromeLinksWithoutPrintedUrls = [
    "#header-chrome-link",
    "#nav-chrome-link",
    "#sidebar-link",
    "#repo-link",
    "#footer-chrome-link"
  ];

  for (const selector of chromeLinksWithoutPrintedUrls) {
    assertNoPrintedUrl(
      element(document, selector),
      rules,
      `${selector} outside printable content`
    );
  }
}

function assertNoPrintedUrl(link, rules, description) {
  const content = valueFor(link, rules, "content", "::after");
  assert.ok(
    content === "" || content === "\"\"",
    `${description} should not produce a printed URL pseudo-element`
  );
}

function assertPrintSafeCodeBlocks(document, rules) {
  const codeBlocks = [
    element(document, "#wrapped-code"),
    element(document, "#plain-pre")
  ];

  for (const codeBlock of codeBlocks) {
    assertImportantDeclaration(codeBlock, rules, "background", "#ffffff");
    assertDeclaration(codeBlock, rules, "border", "1px solid #c8c8c8");
    assertImportantDeclaration(codeBlock, rules, "color", "#111111");
    assertDeclaration(codeBlock, rules, "max-width", "100%");
    assertDeclaration(codeBlock, rules, "overflow", "visible");
    assertDeclaration(codeBlock, rules, "overflow-wrap", "anywhere");
    assertDeclaration(codeBlock, rules, "white-space", "pre-wrap");
    assertDeclaration(codeBlock, rules, "word-break", "normal");
    assertDeclaration(codeBlock, rules, "break-inside", "avoid");
    assertDeclaration(codeBlock, rules, "page-break-inside", "avoid");
  }
}

function assertPaginationSafeguards(document, rules) {
  for (const selector of ["h1", "h2", "h3"]) {
    const heading = element(document, selector);
    assertDeclaration(heading, rules, "break-after", "avoid");
    assertDeclaration(heading, rules, "page-break-after", "avoid");
    assert.notEqual(valueFor(heading, rules, "display"), "none");
    assert.notEqual(valueFor(heading, rules, "overflow"), "hidden");
  }

  for (const selector of ["p", "li", "dt", "dd", "blockquote"]) {
    const block = element(document, selector);
    assertDeclaration(block, rules, "orphans", "3");
    assertDeclaration(block, rules, "widows", "3");
    assert.notEqual(valueFor(block, rules, "display"), "none");
    assert.notEqual(valueFor(block, rules, "overflow"), "hidden");
  }

  for (const selector of [".code-block-copy", "blockquote"]) {
    const block = element(document, selector);
    assertDeclaration(block, rules, "break-inside", "avoid");
    assertDeclaration(block, rules, "page-break-inside", "avoid");
    assert.notEqual(valueFor(block, rules, "display"), "none");
    assert.notEqual(valueFor(block, rules, "overflow"), "hidden");
  }
}

function main() {
  const cssText = fs.readFileSync(STYLE_OUTPUT, "utf8");
  const rules = parsePrintRules(cssText);
  assert.ok(rules.length > 0, "built stylesheet should contain print style rules");

  const dom = new JSDOM(fixtureMarkup());
  const { document } = dom.window;

  assertHiddenChrome(document, rules);
  assertReadableContent(document, rules);
  assertFlattenedLayout(document, rules);
  assertLinkUrlPrinting(document, rules);
  assertPrintSafeCodeBlocks(document, rules);
  assertPaginationSafeguards(document, rules);

  console.log("fkst-website dept=site tag=ok DOCS_PRINT_STYLESHEET_BEHAVIOR");
}

main();
