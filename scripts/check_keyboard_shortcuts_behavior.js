#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const ROOT = path.resolve(__dirname, "..");
const SITE_ROOT = path.join(ROOT, "site");
const SITE_OUTPUT = path.join(SITE_ROOT, "_site");
const MANIFEST = path.join(SITE_ROOT, "probe-manifest");
const SCRIPT_PATH = path.join(SITE_ROOT, "src", "assets", "js", "keyboard-shortcuts.js");
const SCRIPT_OUTPUT_PATH = path.join(SITE_OUTPUT, "assets", "js", "keyboard-shortcuts.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");
const siteRequire = createRequire(path.join(SITE_ROOT, "package.json"));
const { JSDOM } = siteRequire("jsdom");

function manifestRoutes() {
  return fs.readFileSync(MANIFEST, "utf8")
    .split(/\r?\n/)
    .map((line) => line.split("#", 1)[0].trim())
    .filter(Boolean);
}

function outputPath(route) {
  const cleanRoute = route.replace(/^\/+/, "");
  if (route.endsWith("/")) {
    return path.join(SITE_OUTPUT, cleanRoute, "index.html");
  }
  return path.join(SITE_OUTPUT, cleanRoute);
}

function createHarness() {
  const calls = {
    close: 0,
    showModal: 0
  };
  const errors = [];
  const dom = new JSDOM(`<!doctype html>
    <html>
      <body>
        <button type="button" id="opener">Open source</button>
        <input id="editable-input">
        <textarea id="editable-textarea"></textarea>
        <select id="editable-select"><option>One</option></select>
        <div id="editable-rich-text" contenteditable="true" tabindex="0"></div>
        <dialog data-keyboard-shortcut-overlay>
          <div data-keyboard-shortcut-panel>
            <button type="button" data-keyboard-shortcut-close disabled>Close</button>
            <button type="button" id="inside-panel">Inside panel</button>
          </div>
        </dialog>
      </body>
    </html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://fkst.local/"
  });
  const { document, HTMLElement, HTMLDialogElement } = dom.window;

  dom.window.addEventListener("error", (event) => {
    errors.push(event.error || event.message);
  });
  dom.window.addEventListener("unhandledrejection", (event) => {
    errors.push(event.reason);
  });

  Object.defineProperty(HTMLElement.prototype, "isContentEditable", {
    configurable: true,
    get() {
      return this.getAttribute("contenteditable") === "true";
    }
  });

  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      calls.showModal += 1;
      this.open = true;
      this.setAttribute("open", "");
    }
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      calls.close += 1;
      this.open = false;
      this.removeAttribute("open");
      this.dispatchEvent(new dom.window.Event("close"));
    }
  });

  dom.window.eval(SCRIPT_SOURCE);

  return {
    calls,
    document,
    dom,
    errors,
    overlay: document.querySelector("[data-keyboard-shortcut-overlay]"),
    closeButton: document.querySelector("[data-keyboard-shortcut-close]")
  };
}

function dispatchQuestion(target) {
  const event = new target.ownerDocument.defaultView.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "?"
  });
  target.dispatchEvent(event);
  return event;
}

function assertNoClientErrors(errors) {
  assert.deepEqual(errors, []);
}

function openFromOpener(harness) {
  const opener = harness.document.getElementById("opener");
  opener.focus();
  const event = dispatchQuestion(opener);

  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.overlay.open, true);
  assert.equal(harness.calls.showModal, 1);
  assert.equal(harness.document.activeElement, harness.closeButton);
  assert.equal(harness.closeButton.disabled, false);
  return opener;
}

function testBuiltPagesIncludeActivationScript() {
  assert.equal(fs.existsSync(SCRIPT_OUTPUT_PATH), true, `missing built script ${SCRIPT_OUTPUT_PATH}`);
  assert.equal(fs.readFileSync(SCRIPT_OUTPUT_PATH, "utf8"), SCRIPT_SOURCE);

  for (const route of manifestRoutes()) {
    const pagePath = outputPath(route);
    const html = fs.readFileSync(pagePath, "utf8");
    const scriptTags = html.match(/<script\b[^>]*\bdata-keyboard-shortcut-script\b[^>]*>/g) || [];

    assert.equal(scriptTags.length, 1, `${route}: expected one keyboard shortcut activation script`);
    assert.match(scriptTags[0], /\bdefer\b/, `${route}: keyboard shortcut script must be deferred`);
    assert.match(scriptTags[0], /\/assets\/js\/keyboard-shortcuts\.js/, `${route}: keyboard shortcut script path missing`);
  }
}

function testQuestionOpensAndCloseButtonRestoresFocus() {
  const harness = createHarness();
  const opener = openFromOpener(harness);

  harness.closeButton.click();

  assert.equal(harness.overlay.open, false);
  assert.equal(harness.calls.close, 1);
  assert.equal(harness.document.activeElement, opener);
  assertNoClientErrors(harness.errors);
}

function testEscapeCancelClosesAndRestoresFocus() {
  const harness = createHarness();
  const opener = openFromOpener(harness);
  const event = new harness.dom.window.Event("cancel", {
    cancelable: true
  });

  harness.overlay.dispatchEvent(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.overlay.open, false);
  assert.equal(harness.calls.close, 1);
  assert.equal(harness.document.activeElement, opener);
  assertNoClientErrors(harness.errors);
}

function testEditableTargetsDoNotOpen() {
  const editableIds = [
    "editable-input",
    "editable-textarea",
    "editable-select",
    "editable-rich-text"
  ];

  for (const id of editableIds) {
    const harness = createHarness();
    const editable = harness.document.getElementById(id);
    editable.focus();
    const event = dispatchQuestion(editable);

    assert.equal(event.defaultPrevented, false, `${id}: question shortcut should not be intercepted`);
    assert.equal(harness.overlay.open, false, `${id}: overlay must stay closed`);
    assert.equal(harness.calls.showModal, 0, `${id}: showModal must not be called`);
    assertNoClientErrors(harness.errors);
  }
}

function testBackdropClickClosesOnlyOutsidePanel() {
  const harness = createHarness();
  openFromOpener(harness);

  harness.document.getElementById("inside-panel").dispatchEvent(new harness.dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  assert.equal(harness.overlay.open, true);

  harness.overlay.dispatchEvent(new harness.dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  assert.equal(harness.overlay.open, false);
  assert.equal(harness.calls.close, 1);
  assertNoClientErrors(harness.errors);
}

function main() {
  const tests = [
    testBuiltPagesIncludeActivationScript,
    testQuestionOpensAndCloseButtonRestoresFocus,
    testEscapeCancelClosesAndRestoresFocus,
    testEditableTargetsDoNotOpen,
    testBackdropClickClosesOnlyOutsidePanel
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok KEYBOARD_SHORTCUTS_BEHAVIOR tests=${tests.length}`);
}

main();
