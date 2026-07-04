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
const SHORTCUT_SCRIPT_PATH = path.join(SITE_ROOT, "src", "assets", "js", "keyboard-shortcuts.js");
const SHORTCUT_SCRIPT_OUTPUT_PATH = path.join(SITE_OUTPUT, "assets", "js", "keyboard-shortcuts.js");
const SIDEBAR_SCRIPT_PATH = path.join(SITE_ROOT, "src", "assets", "js", "docs-sidebar.js");
const SIDEBAR_SCRIPT_OUTPUT_PATH = path.join(SITE_OUTPUT, "assets", "js", "docs-sidebar.js");
const SHORTCUT_SCRIPT_SOURCE = fs.readFileSync(SHORTCUT_SCRIPT_PATH, "utf8");
const SIDEBAR_SCRIPT_SOURCE = fs.readFileSync(SIDEBAR_SCRIPT_PATH, "utf8");
const SIDEBAR_STORAGE_KEY = "fkst-docs-sidebar";
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

function createBaseMarkup() {
  return `<!doctype html>
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
        <div class="article-shell" data-docs-sidebar-shell data-docs-sidebar-open>
          <aside data-docs-sidebar data-docs-sidebar-state="open">
            <button
              type="button"
              data-docs-sidebar-toggle
              aria-controls="docs-sidebar-panel"
              aria-expanded="true"
              aria-label="Hide docs sidebar"
            >Sidebar</button>
            <nav id="docs-sidebar-panel" data-docs-sidebar-panel aria-label="Article sections">
              <ol data-docs-sidebar-list></ol>
            </nav>
          </aside>
          <div data-docs-sidebar-content>
            <section>
              <h2 id="company-model">Company model<a href="#company-model" data-heading-anchor>#</a></h2>
              <p>Company model body.</p>
            </section>
            <section>
              <h2 id="delivery-model">Reliable delivery<a href="#delivery-model" data-heading-anchor>#</a></h2>
              <p>Reliable delivery body.</p>
            </section>
          </div>
        </div>
      </body>
    </html>`;
}

function installDialogPolyfill(window, calls) {
  const { HTMLDialogElement } = window;
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
      this.dispatchEvent(new window.Event("close"));
    }
  });
}

function installContentEditable(window) {
  Object.defineProperty(window.HTMLElement.prototype, "isContentEditable", {
    configurable: true,
    get() {
      return this.getAttribute("contenteditable") === "true";
    }
  });
}

function createHarness(options = {}) {
  const calls = {
    close: 0,
    showModal: 0
  };
  const errors = [];
  const dom = new JSDOM(createBaseMarkup(), {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://fkst.local/"
  });
  const { document, window } = dom.window;

  window.addEventListener("error", (event) => {
    errors.push(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    errors.push(event.reason);
  });

  installContentEditable(window);
  installDialogPolyfill(window, calls);

  if (options.storedSidebarState !== undefined) {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, options.storedSidebarState);
  }
  if (options.localStorageThrows) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("localStorage unavailable");
      }
    });
  }
  if (options.getItemThrows) {
    Object.defineProperty(window.Storage.prototype, "getItem", {
      configurable: true,
      value() {
        throw new Error("getItem unavailable");
      }
    });
  }
  if (options.setItemThrows) {
    Object.defineProperty(window.Storage.prototype, "setItem", {
      configurable: true,
      value() {
        throw new Error("setItem unavailable");
      }
    });
  }

  try {
    window.eval(SHORTCUT_SCRIPT_SOURCE);
    window.eval(SIDEBAR_SCRIPT_SOURCE);
  } catch (error) {
    errors.push(error);
  }

  return {
    calls,
    document,
    dom,
    errors,
    overlay: document.querySelector("[data-keyboard-shortcut-overlay]"),
    closeButton: document.querySelector("[data-keyboard-shortcut-close]"),
    sidebar: document.querySelector("[data-docs-sidebar]"),
    sidebarPanel: document.querySelector("[data-docs-sidebar-panel]"),
    sidebarList: document.querySelector("[data-docs-sidebar-list]"),
    sidebarShell: document.querySelector("[data-docs-sidebar-shell]"),
    sidebarToggle: document.querySelector("[data-docs-sidebar-toggle]"),
    window
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

function dispatchSidebarShortcut(target, options = {}) {
  const event = new target.ownerDocument.defaultView.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ctrlKey: Boolean(options.ctrlKey),
    key: options.key || "b",
    metaKey: Boolean(options.metaKey),
    shiftKey: Boolean(options.shiftKey)
  });
  target.dispatchEvent(event);
  return event;
}

function assertNoClientErrors(errors) {
  assert.deepEqual(errors, []);
}

function assertSidebarState(harness, expectedState) {
  const isOpen = expectedState === "open";
  assert.equal(harness.sidebarShell.dataset.docsSidebarState, expectedState);
  assert.equal(harness.sidebar.dataset.docsSidebarState, expectedState);
  assert.equal(harness.window.document.documentElement.getAttribute("data-docs-sidebar-state"), expectedState);
  assert.equal(harness.sidebarShell.hasAttribute("data-docs-sidebar-open"), isOpen);
  assert.equal(harness.sidebarShell.hasAttribute("data-docs-sidebar-closed"), !isOpen);
  assert.equal(harness.sidebarPanel.hasAttribute("hidden"), !isOpen);
  assert.equal(harness.sidebarToggle.getAttribute("aria-expanded"), String(isOpen));
  assert.equal(
    harness.sidebarToggle.getAttribute("aria-label"),
    isOpen ? "Hide docs sidebar" : "Show docs sidebar"
  );
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

function testBuiltPagesIncludeActivationScripts() {
  assert.equal(
    fs.existsSync(SHORTCUT_SCRIPT_OUTPUT_PATH),
    true,
    `missing built script ${SHORTCUT_SCRIPT_OUTPUT_PATH}`
  );
  assert.equal(fs.readFileSync(SHORTCUT_SCRIPT_OUTPUT_PATH, "utf8"), SHORTCUT_SCRIPT_SOURCE);
  assert.equal(
    fs.existsSync(SIDEBAR_SCRIPT_OUTPUT_PATH),
    true,
    `missing built script ${SIDEBAR_SCRIPT_OUTPUT_PATH}`
  );
  assert.equal(fs.readFileSync(SIDEBAR_SCRIPT_OUTPUT_PATH, "utf8"), SIDEBAR_SCRIPT_SOURCE);

  for (const route of manifestRoutes()) {
    const pagePath = outputPath(route);
    const html = fs.readFileSync(pagePath, "utf8");
    const shortcutScripts = html.match(/<script\b[^>]*\bdata-keyboard-shortcut-script\b[^>]*>/g) || [];
    const sidebarScripts = html.match(/<script\b[^>]*\bdata-docs-sidebar-script\b[^>]*>/g) || [];
    const isArticle = route === "/architecture.html" ||
      route === "/doctrine.html" ||
      route === "/zh/architecture.html" ||
      route === "/zh/doctrine.html";

    assert.equal(shortcutScripts.length, 1, `${route}: expected one keyboard shortcut activation script`);
    assert.match(shortcutScripts[0], /\bdefer\b/, `${route}: keyboard shortcut script must be deferred`);
    assert.match(
      shortcutScripts[0],
      /\/assets\/js\/keyboard-shortcuts\.js/,
      `${route}: keyboard shortcut script path missing`
    );

    assert.equal(sidebarScripts.length, isArticle ? 1 : 0, `${route}: docs sidebar script scope mismatch`);
    if (isArticle) {
      assert.match(sidebarScripts[0], /\bdefer\b/, `${route}: docs sidebar script must be deferred`);
      assert.match(sidebarScripts[0], /\/assets\/js\/docs-sidebar\.js/, `${route}: docs sidebar script path missing`);
    }
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

function testEditableTargetsDoNotOpenHelpOrToggleSidebar() {
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
    const questionEvent = dispatchQuestion(editable);
    const sidebarEvent = dispatchSidebarShortcut(editable, { ctrlKey: true });

    assert.equal(questionEvent.defaultPrevented, false, `${id}: question shortcut should not be intercepted`);
    assert.equal(sidebarEvent.defaultPrevented, false, `${id}: docs sidebar shortcut should not be intercepted`);
    assert.equal(harness.overlay.open, false, `${id}: overlay must stay closed`);
    assert.equal(harness.calls.showModal, 0, `${id}: showModal must not be called`);
    assertSidebarState(harness, "open");
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

function testDocsSidebarInitialStateBuildsNavigation() {
  const harness = createHarness();
  const links = Array.from(harness.sidebarList.querySelectorAll("a"));

  assertSidebarState(harness, "open");
  assert.deepEqual(
    links.map((link) => [link.getAttribute("href"), link.textContent]),
    [
      ["#company-model", "Company model"],
      ["#delivery-model", "Reliable delivery"],
    ]
  );
  assert.equal(harness.sidebarToggle.disabled, false);
  assertNoClientErrors(harness.errors);
}

function testDocsSidebarPersistedClosedState() {
  const harness = createHarness({ storedSidebarState: "closed" });

  assertSidebarState(harness, "closed");
  assert.equal(harness.window.localStorage.getItem(SIDEBAR_STORAGE_KEY), "closed");
  assertNoClientErrors(harness.errors);
}

function testDocsSidebarShortcutTogglesAndPersists() {
  const harness = createHarness();
  const opener = harness.document.getElementById("opener");

  const ctrlEvent = dispatchSidebarShortcut(opener, { ctrlKey: true });
  assert.equal(ctrlEvent.defaultPrevented, true);
  assertSidebarState(harness, "closed");
  assert.equal(harness.window.localStorage.getItem(SIDEBAR_STORAGE_KEY), "closed");

  const metaEvent = dispatchSidebarShortcut(opener, { metaKey: true });
  assert.equal(metaEvent.defaultPrevented, true);
  assertSidebarState(harness, "open");
  assert.equal(harness.window.localStorage.getItem(SIDEBAR_STORAGE_KEY), "open");
  assertNoClientErrors(harness.errors);
}

function testDocsSidebarButtonTogglesAndPersists() {
  const harness = createHarness();

  harness.sidebarToggle.click();

  assertSidebarState(harness, "closed");
  assert.equal(harness.window.localStorage.getItem(SIDEBAR_STORAGE_KEY), "closed");
  assertNoClientErrors(harness.errors);
}

function testDocsSidebarStorageFailureFallback() {
  for (const options of [
    { localStorageThrows: true },
    { getItemThrows: true },
    { setItemThrows: true },
  ]) {
    const harness = createHarness(options);
    const opener = harness.document.getElementById("opener");

    assertSidebarState(harness, "open");

    const event = dispatchSidebarShortcut(opener, { ctrlKey: true });

    assert.equal(event.defaultPrevented, true);
    assertSidebarState(harness, "closed");
    assertNoClientErrors(harness.errors);
  }
}

function testQuestionHelpCoexistsWithDocsSidebarShortcut() {
  const harness = createHarness();
  const opener = harness.document.getElementById("opener");

  const questionEvent = dispatchQuestion(opener);
  assert.equal(questionEvent.defaultPrevented, true);
  assert.equal(harness.overlay.open, true);
  assertSidebarState(harness, "open");

  const sidebarEvent = dispatchSidebarShortcut(opener, { ctrlKey: true });
  assert.equal(sidebarEvent.defaultPrevented, true);
  assert.equal(harness.overlay.open, true);
  assertSidebarState(harness, "closed");
  assertNoClientErrors(harness.errors);
}

function main() {
  const tests = [
    testBuiltPagesIncludeActivationScripts,
    testQuestionOpensAndCloseButtonRestoresFocus,
    testEscapeCancelClosesAndRestoresFocus,
    testEditableTargetsDoNotOpenHelpOrToggleSidebar,
    testBackdropClickClosesOnlyOutsidePanel,
    testDocsSidebarInitialStateBuildsNavigation,
    testDocsSidebarPersistedClosedState,
    testDocsSidebarShortcutTogglesAndPersists,
    testDocsSidebarButtonTogglesAndPersists,
    testDocsSidebarStorageFailureFallback,
    testQuestionHelpCoexistsWithDocsSidebarShortcut,
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok KEYBOARD_SHORTCUTS_BEHAVIOR tests=${tests.length}`);
}

main();
