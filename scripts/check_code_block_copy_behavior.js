#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const ROOT = path.resolve(__dirname, "..");
const SITE_ROOT = path.join(ROOT, "site");
const SCRIPT_PATH = path.join(SITE_ROOT, "src", "assets", "js", "code-block-copy.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");
const siteRequire = createRequire(path.join(SITE_ROOT, "package.json"));
const { JSDOM } = siteRequire("jsdom");

function createClock() {
  let currentTime = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, {
        callback,
        runAt: currentTime + delay
      });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advanceBy(ms) {
      currentTime += ms;
      let ranTimer = true;
      while (ranTimer) {
        ranTimer = false;
        for (const [id, timer] of [...timers.entries()].sort((a, b) => a[1].runAt - b[1].runAt)) {
          if (timer.runAt <= currentTime) {
            timers.delete(id);
            timer.callback();
            ranTimer = true;
            break;
          }
        }
      }
    }
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function codeWrapper(text, options = {}) {
  const button = options.button === false
    ? ""
    : '<button type="button" data-code-block-copy-button disabled hidden>Copy</button>';
  const status = options.status === false
    ? ""
    : `<span data-code-block-copy-status>${escapeHtml(options.statusText || "")}</span>`;
  const code = options.code === false
    ? ""
    : `<pre><code>${escapeHtml(options.codeText ?? text)}</code></pre>`;
  const copyText = options.sourceText === undefined
    ? ` data-code-block-copy-text="${escapeHtml(text)}"`
    : options.sourceText === null
      ? ""
      : ` data-code-block-copy-text="${escapeHtml(options.sourceText)}"`;
  const language = options.language === undefined
    ? ' data-code-block-copy-language=""'
    : options.language === null
      ? ""
      : ` data-code-block-copy-language="${escapeHtml(options.language)}"`;
  const info = options.info === undefined
    ? ' data-code-block-copy-info=""'
    : options.info === null
      ? ""
      : ` data-code-block-copy-info="${escapeHtml(options.info)}"`;
  const kind = options.kind === undefined
    ? ' data-code-block-copy-kind="code_block"'
    : options.kind === null
      ? ""
      : ` data-code-block-copy-kind="${escapeHtml(options.kind)}"`;

  return `<div data-code-block-copy${copyText}${language}${info}${kind}>${button}${status}${code}</div>`;
}

function getButton(wrapper) {
  return wrapper.querySelector("[data-code-block-copy-button]");
}

function getStatus(wrapper) {
  return wrapper.querySelector("[data-code-block-copy-status]");
}

function selectedTextareaText(document) {
  const textArea = document.querySelector("textarea");
  assert.ok(textArea, "fallback copy should create a textarea while execCommand runs");
  return textArea.value.slice(textArea.selectionStart, textArea.selectionEnd);
}

function createHarness(wrappers, options = {}) {
  const calls = {
    writeText: [],
    execCommand: []
  };
  const clock = createClock();
  const errors = [];
  const dom = new JSDOM(`<!doctype html><html><body>${wrappers.join("")}</body></html>`, {
    runScripts: "outside-only",
    url: "https://fkst.local/"
  });
  const { document, navigator } = dom.window;

  dom.window.setTimeout = clock.setTimeout;
  dom.window.clearTimeout = clock.clearTimeout;
  dom.window.addEventListener("error", (event) => {
    errors.push(event.error || event.message);
  });
  dom.window.addEventListener("unhandledrejection", (event) => {
    errors.push(event.reason);
  });

  document.execCommand = (command) => {
    calls.execCommand.push({
      command,
      text: selectedTextareaText(document)
    });
    if (options.execCommandThrows) {
      throw new Error("execCommand failed");
    }
    return options.execCommandResult !== false;
  };

  if (options.clipboard === "missing") {
    delete navigator.clipboard;
  } else {
    const clipboard = {};
    if (options.clipboard !== "writeTextMissing") {
      clipboard.writeText = async (text) => {
        calls.writeText.push(text);
        if (options.writeTextRejects) {
          throw new Error("async clipboard rejected");
        }
      };
    }
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard
    });
  }

  dom.window.eval(SCRIPT_SOURCE);

  return {
    calls,
    clock,
    document,
    errors,
    window: dom.window
  };
}

async function clickAndFlush(button) {
  button.click();
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

function assertNoClientErrors(errors) {
  assert.deepEqual(errors, []);
}

function assertCopied(wrapper) {
  const button = getButton(wrapper);
  const status = getStatus(wrapper);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "Copied");
  assert.equal(status.textContent, "Copied");
  assert.equal(button.getAttribute("data-copy-state"), "copied");
  assert.equal(wrapper.getAttribute("data-copy-state"), "copied");
}

function assertFailed(wrapper) {
  const button = getButton(wrapper);
  const status = getStatus(wrapper);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "Copy failed");
  assert.equal(status.textContent, "Copy failed");
  assert.equal(button.getAttribute("data-copy-state"), "failed");
  assert.equal(wrapper.getAttribute("data-copy-state"), "failed");
}

function assertIdle(wrapper) {
  const button = getButton(wrapper);
  const status = getStatus(wrapper);
  assert.equal(button.textContent, "Copy");
  assert.equal(status.textContent, "");
  assert.equal(button.getAttribute("data-copy-state"), null);
  assert.equal(wrapper.getAttribute("data-copy-state"), null);
}

async function testCopiesOnlyClickedBlock() {
  const { calls, document, errors } = createHarness([
    codeWrapper("first block\n"),
    codeWrapper("second block\n", {
      codeText: "nested DOM code text must not be copied\n",
      statusText: "status text must not be copied"
    })
  ]);
  const [first, second] = document.querySelectorAll("[data-code-block-copy]");

  await clickAndFlush(getButton(second));

  assertNoClientErrors(errors);
  assert.deepEqual(calls.writeText, ["second block\n"]);
  assert.equal(calls.writeText[0].includes("Copy"), false);
  assert.equal(calls.writeText[0].includes("status text must not be copied"), false);
  assert.equal(calls.writeText[0].includes("nested DOM code text must not be copied"), false);
  assert.equal(calls.execCommand.length, 0);
  assertCopied(second);
  assert.equal(getButton(first).getAttribute("data-copy-state"), null);
  assert.equal(first.getAttribute("data-copy-state"), null);
}

async function testSuccessfulAsyncClipboardResets() {
  const { calls, clock, document, errors } = createHarness([
    codeWrapper("printf 'fenced'\n")
  ]);
  const wrapper = document.querySelector("[data-code-block-copy]");

  await clickAndFlush(getButton(wrapper));

  assertNoClientErrors(errors);
  assert.deepEqual(calls.writeText, ["printf 'fenced'\n"]);
  assertCopied(wrapper);
  clock.advanceBy(1599);
  assertCopied(wrapper);
  clock.advanceBy(1);
  assertIdle(wrapper);
}

async function testFallbackWhenWriteTextUnavailable() {
  const { calls, document, errors } = createHarness([
    codeWrapper("fallback without writeText\n")
  ], {
    clipboard: "writeTextMissing"
  });
  const wrapper = document.querySelector("[data-code-block-copy]");

  await clickAndFlush(getButton(wrapper));

  assertNoClientErrors(errors);
  assert.deepEqual(calls.writeText, []);
  assert.deepEqual(calls.execCommand, [{
    command: "copy",
    text: "fallback without writeText\n"
  }]);
  assertCopied(wrapper);
}

async function testFallbackAfterAsyncRejects() {
  const { calls, document, errors } = createHarness([
    codeWrapper("fallback after rejection\n")
  ], {
    writeTextRejects: true
  });
  const wrapper = document.querySelector("[data-code-block-copy]");

  await clickAndFlush(getButton(wrapper));

  assertNoClientErrors(errors);
  assert.deepEqual(calls.writeText, ["fallback after rejection\n"]);
  assert.deepEqual(calls.execCommand, [{
    command: "copy",
    text: "fallback after rejection\n"
  }]);
  assertCopied(wrapper);
}

async function testFailureWhenAllCopyPathsFail() {
  const { calls, clock, document, errors } = createHarness([
    codeWrapper("uncopied text\n")
  ], {
    writeTextRejects: true,
    execCommandResult: false
  });
  const wrapper = document.querySelector("[data-code-block-copy]");

  await clickAndFlush(getButton(wrapper));

  assertNoClientErrors(errors);
  assert.deepEqual(calls.writeText, ["uncopied text\n"]);
  assert.deepEqual(calls.execCommand, [{
    command: "copy",
    text: "uncopied text\n"
  }]);
  assertFailed(wrapper);
  assert.equal(document.querySelectorAll("textarea").length, 0);
  clock.advanceBy(1600);
  assertIdle(wrapper);
}

async function testIncompleteWrappersOnlyActivateWithSourceContract() {
  const { calls, document, errors } = createHarness([
    codeWrapper("missing button\n", {
      button: false
    }),
    codeWrapper("missing status\n", {
      status: false
    }),
    codeWrapper("source without nested code\n", {
      code: false
    }),
    codeWrapper("missing source contract\n", {
      sourceText: null
    }),
    codeWrapper("missing language contract\n", {
      language: null
    }),
    codeWrapper("missing info contract\n", {
      info: null
    }),
    codeWrapper("missing kind contract\n", {
      kind: null
    })
  ]);
  const [
    missingButton,
    missingStatus,
    sourceOnly,
    missingSource,
    missingLanguage,
    missingInfo,
    missingKind
  ] = document.querySelectorAll("[data-code-block-copy]");

  await clickAndFlush(getButton(missingStatus));
  await clickAndFlush(getButton(sourceOnly));
  await clickAndFlush(getButton(missingSource));
  await clickAndFlush(getButton(missingLanguage));
  await clickAndFlush(getButton(missingInfo));
  await clickAndFlush(getButton(missingKind));

  assertNoClientErrors(errors);
  assert.deepEqual(calls.writeText, ["source without nested code\n"]);
  assert.deepEqual(calls.execCommand, []);
  assert.equal(getButton(missingStatus).disabled, true);
  assert.equal(getButton(missingStatus).hidden, true);
  assert.equal(getButton(sourceOnly).disabled, false);
  assert.equal(getButton(missingSource).disabled, true);
  assert.equal(getButton(missingSource).hidden, true);
  assert.equal(getButton(missingLanguage).disabled, true);
  assert.equal(getButton(missingLanguage).hidden, true);
  assert.equal(getButton(missingInfo).disabled, true);
  assert.equal(getButton(missingInfo).hidden, true);
  assert.equal(getButton(missingKind).disabled, true);
  assert.equal(getButton(missingKind).hidden, true);
  assert.equal(getStatus(missingButton).textContent, "");
  assertCopied(sourceOnly);
}

async function testEmptySourceTextIsValid() {
  const { calls, document, errors } = createHarness([
    codeWrapper("", {
      language: "",
      info: "",
      kind: "fence"
    })
  ]);
  const wrapper = document.querySelector("[data-code-block-copy]");

  await clickAndFlush(getButton(wrapper));

  assertNoClientErrors(errors);
  assert.deepEqual(calls.writeText, [""]);
  assert.equal(getButton(wrapper).disabled, false);
  assert.equal(getButton(wrapper).hidden, false);
  assertCopied(wrapper);
}

function testDoesNotScrapePreCodeSource() {
  assert.equal(SCRIPT_SOURCE.includes('querySelector("pre code")'), false);
  assert.equal(SCRIPT_SOURCE.includes("querySelector('pre code')"), false);
  assert.equal(SCRIPT_SOURCE.includes('querySelector("code")'), false);
  assert.equal(SCRIPT_SOURCE.includes("querySelector('code')"), false);
  assert.equal(SCRIPT_SOURCE.includes("code.textContent"), false);
}

async function main() {
  const tests = [
    testCopiesOnlyClickedBlock,
    testSuccessfulAsyncClipboardResets,
    testFallbackWhenWriteTextUnavailable,
    testFallbackAfterAsyncRejects,
    testFailureWhenAllCopyPathsFail,
    testIncompleteWrappersOnlyActivateWithSourceContract,
    testEmptySourceTextIsValid,
    testDoesNotScrapePreCodeSource
  ];

  for (const test of tests) {
    await test();
  }

  console.log(`fkst-website dept=site tag=ok CODE_BLOCK_COPY_BEHAVIOR tests=${tests.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
