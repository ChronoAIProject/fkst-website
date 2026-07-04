#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT_PATH = path.join(ROOT, "site", "src", "assets", "js", "code-block-copy.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

class MiniElement {
  constructor(tagName, attrs = {}, text = "") {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.ownerDocument = null;
    this.eventListeners = new Map();
    this.style = {};
    this._text = String(text);

    for (const [name, value] of Object.entries(attrs)) {
      this.setAttribute(name, value);
    }
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument;
      child.visit((descendant) => {
        descendant.ownerDocument = this.ownerDocument;
      });
      this.children.push(child);
    }
  }

  remove() {
    if (!this.parentNode) {
      return;
    }

    const index = this.parentNode.children.indexOf(this);
    if (index !== -1) {
      this.parentNode.children.splice(index, 1);
    }
    this.parentNode = null;
  }

  setAttribute(name, value = "") {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    const listeners = this.eventListeners.get(type) || [];
    listeners.push(listener);
    this.eventListeners.set(type, listeners);
  }

  dispatchEvent(event) {
    const listeners = this.eventListeners.get(event.type) || [];
    for (const listener of listeners) {
      try {
        const result = listener.call(this, event);
        if (result && typeof result.then === "function" && this.ownerDocument) {
          this.ownerDocument.pendingEvents.push(result);
        }
      } catch (error) {
        if (this.ownerDocument) {
          this.ownerDocument.eventErrors.push(error);
        } else {
          throw error;
        }
      }
    }
    return true;
  }

  click() {
    return this.dispatchEvent({
      type: "click",
      target: this,
      currentTarget: this
    });
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    this.visit((element) => {
      if (element !== this && matchesSelector(element, selector)) {
        matches.push(element);
      }
    });
    return matches;
  }

  visit(callback) {
    callback(this);
    for (const child of this.children) {
      child.visit(callback);
    }
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this.children = [];
    this._text = String(value);
  }

  select() {
    if (this.ownerDocument) {
      this.ownerDocument.selectedText = this.value || this.textContent;
    }
  }

  setSelectionRange(start, end) {
    if (this.ownerDocument) {
      const value = this.value || this.textContent;
      this.ownerDocument.selectedText = value.slice(start, end);
    }
  }
}

class MiniButtonElement extends MiniElement {
  constructor(attrs = {}, text = "") {
    super("button", attrs, text);
    this.disabled = false;
  }
}

class MiniTextAreaElement extends MiniElement {
  constructor() {
    super("textarea");
    this.value = "";
  }
}

class MiniDocument {
  constructor(body, execCommand) {
    this.body = body;
    this.selectedText = "";
    this.pendingEvents = [];
    this.eventErrors = [];
    this.execCommand = execCommand;
    this.attach(body);
  }

  attach(element) {
    element.ownerDocument = this;
    for (const child of element.children) {
      this.attach(child);
    }
  }

  createElement(tagName) {
    const normalized = tagName.toLowerCase();
    const element = normalized === "textarea"
      ? new MiniTextAreaElement()
      : new MiniElement(normalized);
    this.attach(element);
    return element;
  }

  querySelectorAll(selector) {
    const matches = [];
    this.body.visit((element) => {
      if (matchesSelector(element, selector)) {
        matches.push(element);
      }
    });
    return matches;
  }
}

function matchesSelector(element, selector) {
  if (selector === "[data-code-block-copy]") {
    return element.hasAttribute("data-code-block-copy");
  }
  if (selector === "[data-code-block-copy-button]") {
    return element.hasAttribute("data-code-block-copy-button");
  }
  if (selector === "[data-code-block-copy-status]") {
    return element.hasAttribute("data-code-block-copy-status");
  }
  if (selector === "pre code") {
    return element.tagName === "CODE" && Boolean(findAncestor(element, "PRE"));
  }
  if (selector === "textarea") {
    return element.tagName === "TEXTAREA";
  }
  throw new Error(`unsupported selector in test DOM: ${selector}`);
}

function findAncestor(element, tagName) {
  let current = element.parentNode;
  while (current) {
    if (current.tagName === tagName) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

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

function element(tagName, attrs = {}, children = []) {
  const node = tagName === "button"
    ? new MiniButtonElement(attrs)
    : new MiniElement(tagName, attrs);
  for (const child of children) {
    if (typeof child === "string") {
      node.append(new MiniElement("#text", {}, child));
    } else {
      node.append(child);
    }
  }
  return node;
}

function codeWrapper(text, options = {}) {
  const includeButton = options.button !== false;
  const includeStatus = options.status !== false;
  const includeCode = options.code !== false;
  const children = [];

  if (includeButton) {
    children.push(new MiniButtonElement({
      "data-code-block-copy-button": ""
    }, options.buttonText || "Copy"));
  }
  if (includeStatus) {
    children.push(element("span", {
      "data-code-block-copy-status": ""
    }, [options.statusText || ""]));
  }
  if (includeCode) {
    children.push(element("pre", {}, [
      element("code", {}, [text])
    ]));
  }

  return element("div", {
    "data-code-block-copy": ""
  }, children);
}

function getButton(wrapper) {
  return wrapper.querySelector("[data-code-block-copy-button]");
}

function getStatus(wrapper) {
  return wrapper.querySelector("[data-code-block-copy-status]");
}

function createHarness(wrappers, options = {}) {
  const body = element("body", {}, wrappers);
  const calls = {
    writeText: [],
    execCommand: []
  };
  const document = new MiniDocument(body, (command) => {
    calls.execCommand.push({
      command,
      text: document.selectedText
    });
    if (options.execCommandThrows) {
      throw new Error("execCommand failed");
    }
    return options.execCommandResult !== false;
  });
  const clock = createClock();
  const navigator = {};

  if (options.clipboard !== "missing") {
    navigator.clipboard = {};
    if (options.clipboard !== "writeTextMissing") {
      navigator.clipboard.writeText = async (text) => {
        calls.writeText.push(text);
        if (options.writeTextRejects) {
          throw new Error("async clipboard rejected");
        }
      };
    }
  }

  const window = {
    document,
    navigator,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  };
  const sandbox = {
    document,
    navigator,
    window,
    HTMLButtonElement: MiniButtonElement,
    Error
  };
  window.HTMLButtonElement = MiniButtonElement;

  vm.runInNewContext(SCRIPT_SOURCE, sandbox, {
    filename: SCRIPT_PATH
  });

  return {
    calls,
    clock,
    document
  };
}

async function flushEvents(document) {
  const pending = document.pendingEvents.splice(0);
  const results = await Promise.allSettled(pending);
  const failures = [
    ...document.eventErrors,
    ...results.filter((result) => result.status === "rejected").map((result) => result.reason)
  ];
  assert.deepEqual(failures, []);
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
  const first = codeWrapper("first block\n");
  const second = codeWrapper("second block\n", {
    statusText: "status text must not be copied"
  });
  const { calls, document } = createHarness([first, second]);

  getButton(second).click();
  await flushEvents(document);

  assert.deepEqual(calls.writeText, ["second block\n"]);
  assert.equal(calls.writeText[0].includes("Copy"), false);
  assert.equal(calls.writeText[0].includes("status text must not be copied"), false);
  assert.equal(calls.execCommand.length, 0);
  assertCopied(second);
  assert.equal(getButton(first).getAttribute("data-copy-state"), null);
  assert.equal(first.getAttribute("data-copy-state"), null);
}

async function testSuccessfulAsyncClipboardResets() {
  const wrapper = codeWrapper("printf 'fenced'\n");
  const { calls, clock, document } = createHarness([wrapper]);

  getButton(wrapper).click();
  await flushEvents(document);

  assert.deepEqual(calls.writeText, ["printf 'fenced'\n"]);
  assertCopied(wrapper);
  clock.advanceBy(1599);
  assertCopied(wrapper);
  clock.advanceBy(1);
  assertIdle(wrapper);
}

async function testFallbackWhenWriteTextUnavailable() {
  const wrapper = codeWrapper("fallback without writeText\n");
  const { calls, document } = createHarness([wrapper], {
    clipboard: "writeTextMissing"
  });

  getButton(wrapper).click();
  await flushEvents(document);

  assert.deepEqual(calls.writeText, []);
  assert.deepEqual(calls.execCommand, [{
    command: "copy",
    text: "fallback without writeText\n"
  }]);
  assertCopied(wrapper);
}

async function testFallbackAfterAsyncRejects() {
  const wrapper = codeWrapper("fallback after rejection\n");
  const { calls, document } = createHarness([wrapper], {
    writeTextRejects: true
  });

  getButton(wrapper).click();
  await flushEvents(document);

  assert.deepEqual(calls.writeText, ["fallback after rejection\n"]);
  assert.deepEqual(calls.execCommand, [{
    command: "copy",
    text: "fallback after rejection\n"
  }]);
  assertCopied(wrapper);
}

async function testFailureWhenAllCopyPathsFail() {
  const wrapper = codeWrapper("uncopied text\n");
  const { calls, clock, document } = createHarness([wrapper], {
    writeTextRejects: true,
    execCommandResult: false
  });

  getButton(wrapper).click();
  await flushEvents(document);

  assert.deepEqual(calls.writeText, ["uncopied text\n"]);
  assert.deepEqual(calls.execCommand, [{
    command: "copy",
    text: "uncopied text\n"
  }]);
  assertFailed(wrapper);
  assert.equal(document.body.querySelectorAll("textarea").length, 0);
  clock.advanceBy(1600);
  assertIdle(wrapper);
}

async function testIncompleteWrappersDoNothing() {
  const missingButton = codeWrapper("missing button\n", {
    button: false
  });
  const missingStatus = codeWrapper("missing status\n", {
    status: false
  });
  const missingCode = codeWrapper("", {
    code: false
  });
  const { calls, document } = createHarness([missingButton, missingStatus, missingCode]);

  getButton(missingStatus).click();
  getButton(missingCode).click();
  await flushEvents(document);

  assert.deepEqual(document.eventErrors, []);
  assert.deepEqual(calls.writeText, []);
  assert.deepEqual(calls.execCommand, []);
  assert.equal(getButton(missingStatus).disabled, false);
  assert.equal(getButton(missingCode).disabled, false);
  assert.equal(getStatus(missingButton).textContent, "");
  assert.equal(getStatus(missingCode).textContent, "");
}

async function main() {
  const tests = [
    testCopiesOnlyClickedBlock,
    testSuccessfulAsyncClipboardResets,
    testFallbackWhenWriteTextUnavailable,
    testFallbackAfterAsyncRejects,
    testFailureWhenAllCopyPathsFail,
    testIncompleteWrappersDoNothing
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
