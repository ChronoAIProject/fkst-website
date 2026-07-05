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
const ARTICLE_ROUTES = [
  "/architecture.html",
  "/doctrine.html",
  "/zh/architecture.html",
  "/zh/doctrine.html",
];
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
              <ol data-docs-sidebar-list>
                <li data-docs-toc-entry data-docs-toc-level="2" data-docs-toc-depth="2">
                  <a href="#company-model" data-docs-toc-link>Company model</a>
                </li>
                <li data-docs-toc-entry data-docs-toc-level="2" data-docs-toc-depth="2">
                  <a href="#delivery-model" data-docs-toc-link>Reliable delivery</a>
                </li>
              </ol>
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

function createSidebarMarkup(content = "") {
  const navigation = `
    <li data-docs-toc-entry data-docs-toc-level="2" data-docs-toc-depth="2">
      <a href="#company-model" data-docs-toc-link>Company model</a>
    </li>
    <li data-docs-toc-entry data-docs-toc-level="2" data-docs-toc-depth="2">
      <a href="#delivery-model" data-docs-toc-link>Reliable delivery</a>
    </li>
    <li data-docs-toc-entry data-docs-toc-level="3" data-docs-toc-depth="3">
      <a href="#%E5%86%99%20posture" data-docs-toc-link>写 posture</a>
    </li>
    <li data-docs-toc-entry data-docs-toc-level="3" data-docs-toc-depth="3">
      <a href="#missing-target" data-docs-toc-link>Missing target</a>
    </li>
  `;

  return `<!doctype html>
    <html>
      <body>
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
              <ol data-docs-sidebar-list>${navigation}</ol>
            </nav>
          </aside>
          <div data-docs-sidebar-content>${content}</div>
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

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      const normalizedKey = String(key);
      return data.has(normalizedKey) ? data.get(normalizedKey) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    }
  };
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

  if (options.localStorage) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: options.localStorage
    });
  }
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

function createSidebarHarness(options = {}) {
  const errors = [];
  const listeners = [];
  const rafCallbacks = [];
  const timeoutCallbacks = [];
  const headingTops = { ...(options.headingTops || {}) };
  let viewportHeight = options.viewportHeight ?? 1000;
  const html = options.html || createSidebarMarkup(options.content || `
    <section>
      <h2 id="company-model">Company model<a href="#company-model" data-heading-anchor>#</a></h2>
      <p>Company model body.</p>
    </section>
    <section>
      <h2 id="delivery-model">Reliable delivery<a href="#delivery-model" data-heading-anchor>#</a></h2>
      <p>Reliable delivery body.</p>
    </section>
  `);
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: options.url || "https://fkst.local/"
  });
  const { document, window } = dom.window;

  window.addEventListener("error", (event) => {
    errors.push(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    errors.push(event.reason);
  });

  installContentEditable(window);

  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get() {
      return viewportHeight;
    }
  });

  window.requestAnimationFrame = (callback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  };
  window.setTimeout = (callback, delay) => {
    timeoutCallbacks.push({ callback, delay });
    return timeoutCallbacks.length;
  };
  const addEventListener = window.addEventListener.bind(window);
  window.addEventListener = (name, callback, listenerOptions) => {
    listeners.push({ name, callback, options: listenerOptions });
    return addEventListener(name, callback, listenerOptions);
  };

  for (const [id, top] of Object.entries(headingTops)) {
    const heading = document.getElementById(id);
    if (heading) {
      heading.getBoundingClientRect = () => ({
        bottom: headingTops[id] + 40,
        height: 40,
        left: 0,
        right: 0,
        top: headingTops[id],
        width: 0,
        x: 0,
        y: headingTops[id]
      });
    }
  }

  if (options.localStorage) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: options.localStorage
    });
  }
  if (options.storedSidebarState !== undefined) {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, options.storedSidebarState);
  }
  if (options.localStorageValue !== undefined) {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, options.localStorageValue);
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
    window.eval(SIDEBAR_SCRIPT_SOURCE);
  } catch (error) {
    errors.push(error);
  }

  return {
    document,
    dom,
    errors,
    listeners,
    rafCallbacks,
    sidebar: document.querySelector("[data-docs-sidebar]"),
    sidebarPanel: document.querySelector("[data-docs-sidebar-panel]"),
    sidebarList: document.querySelector("[data-docs-sidebar-list]"),
    sidebarShell: document.querySelector("[data-docs-sidebar-shell]"),
    sidebarToggle: document.querySelector("[data-docs-sidebar-toggle]"),
    timeoutCallbacks,
    dispatch(name) {
      window.dispatchEvent(new window.Event(name));
    },
    flushRaf() {
      const callbacks = rafCallbacks.splice(0);
      for (const callback of callbacks) {
        callback(0);
      }
    },
    flushTimeouts() {
      const callbacks = timeoutCallbacks.splice(0);
      for (const { callback } of callbacks) {
        callback();
      }
    },
    setHeadingTop(id, top) {
      headingTops[id] = top;
    },
    setViewportHeight(value) {
      viewportHeight = value;
    },
    window
  };
}

function createAbsentSidebarHarness(html = "<!doctype html><html><body><main><h1>Home</h1></main></body></html>") {
  const errors = [];
  const dom = new JSDOM(html, {
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

  try {
    window.eval(SIDEBAR_SCRIPT_SOURCE);
  } catch (error) {
    errors.push(error);
  }

  return {
    document,
    dom,
    errors,
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
    altKey: Boolean(options.altKey),
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

function preventableSidebarShortcut(target, options = {}) {
  const event = new target.ownerDocument.defaultView.KeyboardEvent("keydown", {
    altKey: Boolean(options.altKey),
    bubbles: true,
    cancelable: true,
    ctrlKey: Boolean(options.ctrlKey),
    key: options.key || "b",
    metaKey: Boolean(options.metaKey),
    shiftKey: Boolean(options.shiftKey)
  });
  if (options.defaultPrevented) {
    event.preventDefault();
  }
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

function normalizeText(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function sidebarLinks(harness) {
  return Array.from(harness.sidebarList.querySelectorAll("a"));
}

function activeSidebarLinks(harness) {
  return sidebarLinks(harness).filter((link) => link.getAttribute("aria-current") === "location");
}

function assertActiveSidebarHref(harness, expectedHref) {
  assert.deepEqual(
    activeSidebarLinks(harness).map((link) => link.getAttribute("href")),
    expectedHref ? [expectedHref] : []
  );
}

function expectedHeadingLinks(document) {
  const content = document.querySelector("[data-docs-sidebar-content]");
  assert.ok(content, "expected docs sidebar content root");

  return Array.from(content.querySelectorAll("h2[id], h3[id]"))
    .map((heading) => {
      const clone = heading.cloneNode(true);
      clone.querySelectorAll("[data-heading-anchor]").forEach((anchor) => anchor.remove());
      return {
        href: `#${encodeURIComponent(heading.id)}`,
        id: heading.id,
        label: normalizeText(clone.textContent),
        level: heading.tagName.toLowerCase() === "h3" ? "3" : "2"
      };
    })
    .filter((heading) => heading.label);
}

function expectedRenderedTocLinks(document) {
  return Array.from(document.querySelectorAll("[data-docs-toc-entry]"))
    .map((entry) => {
      const link = entry.querySelector("[data-docs-toc-link]");
      return {
        depth: entry.getAttribute("data-docs-toc-depth"),
        href: link ? link.getAttribute("href") : "",
        label: link ? normalizeText(link.textContent) : "",
        level: entry.getAttribute("data-docs-toc-level")
      };
    })
    .filter((entry) => entry.href && entry.label);
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
    const isArticle = ARTICLE_ROUTES.includes(route);

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

function testBuiltArticlePagesRenderDocsSidebarNavigation() {
  for (const route of ARTICLE_ROUTES) {
    const html = fs.readFileSync(outputPath(route), "utf8");
    const harness = createSidebarHarness({
      html,
      url: `https://fkst.local${route}`
    });
    const expectedLinks = expectedHeadingLinks(harness.document);
    const renderedTocLinks = expectedRenderedTocLinks(harness.document);
    const links = sidebarLinks(harness);

    assert.ok(expectedLinks.length > 0, `${route}: expected article headings`);
    assert.deepEqual(
      renderedTocLinks,
      expectedLinks.map((heading) => ({
        depth: heading.level,
        href: heading.href,
        label: heading.label,
        level: heading.level
      })),
      `${route}: rendered TOC must mirror article headings`
    );
    assert.equal(links.length, expectedLinks.length, `${route}: sidebar link count mismatch`);
    assert.deepEqual(
      links.map((link) => ({
        href: link.getAttribute("href"),
        label: normalizeText(link.textContent)
      })),
      expectedLinks.map((heading) => ({
        href: heading.href,
        label: heading.label
      })),
      `${route}: sidebar links must mirror article heading ids and labels`
    );
    assert.equal(
      links.some((link) => normalizeText(link.textContent).includes("#")),
      false,
      `${route}: sidebar labels must strip heading anchor text`
    );
    assert.equal(harness.sidebar.hasAttribute("data-docs-sidebar-empty"), false);
    assertSidebarState(harness, "open");
    assertNoClientErrors(harness.errors);
  }
}

function testNonArticlePagesDoNotRunDocsSidebarContract() {
  for (const route of manifestRoutes().filter((route) => !ARTICLE_ROUTES.includes(route))) {
    const html = fs.readFileSync(outputPath(route), "utf8");
    const harness = createAbsentSidebarHarness(html);
    const event = dispatchSidebarShortcut(harness.document.body, { ctrlKey: true });

    assert.equal(event.defaultPrevented, false, `${route}: missing sidebar DOM should not register shortcut`);
    assert.equal(
      harness.document.documentElement.hasAttribute("data-docs-sidebar-state"),
      false,
      `${route}: document state should not be introduced`
    );
    assert.equal(
      harness.document.querySelector("[data-docs-sidebar-state]"),
      null,
      `${route}: sidebar state attributes should not be introduced`
    );
    assertNoClientErrors(harness.errors);
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

function testDocsSidebarShortcutRejectsNonMatchingKeys() {
  const cases = [
    ["alt-b", { altKey: true, ctrlKey: true }],
    ["shift-b", { ctrlKey: true, shiftKey: true }],
    ["ctrl-meta-b", { ctrlKey: true, metaKey: true }],
    ["non-b", { ctrlKey: true, key: "k" }],
    ["plain-b", {}],
    ["default-prevented", { ctrlKey: true, defaultPrevented: true }],
  ];

  for (const [id, options] of cases) {
    const harness = createHarness();
    const opener = harness.document.getElementById("opener");
    const event = preventableSidebarShortcut(opener, options);

    assert.equal(event.defaultPrevented, Boolean(options.defaultPrevented), `${id}: event prevention mismatch`);
    assertSidebarState(harness, "open");
    assert.equal(harness.window.localStorage.getItem(SIDEBAR_STORAGE_KEY), null, `${id}: state should not persist`);
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

function testDocsSidebarInitialHashActivatesDecodedTarget() {
  const harness = createSidebarHarness({
    content: `
      <section>
        <h2 id="company-model">Company model<a href="#company-model" data-heading-anchor>#</a></h2>
      </section>
      <section>
        <h2 id="delivery-model">Reliable delivery<a href="#delivery-model" data-heading-anchor>#</a></h2>
      </section>
      <section>
        <h3 id="写 posture">写 posture<a href="#写 posture" data-heading-anchor>#</a></h3>
      </section>
    `,
    url: "https://fkst.local/docs.html#%E5%86%99%20posture"
  });

  assertActiveSidebarHref(harness, "#%E5%86%99%20posture");
  assert.equal(harness.rafCallbacks.length, 0);
  assertNoClientErrors(harness.errors);
}

function testDocsSidebarScrollHashAndClickActiveState() {
  const harness = createSidebarHarness({
    content: `
      <section>
        <h2 id="company-model">Company model<a href="#company-model" data-heading-anchor>#</a></h2>
      </section>
      <section>
        <h2 id="delivery-model">Reliable delivery<a href="#delivery-model" data-heading-anchor>#</a></h2>
      </section>
      <section>
        <h3 id="写 posture">写 posture<a href="#写 posture" data-heading-anchor>#</a></h3>
      </section>
    `,
    headingTops: {
      "company-model": 20,
      "delivery-model": 360,
      "写 posture": 720
    },
    url: "https://fkst.local/docs.html"
  });

  assert.equal(harness.rafCallbacks.length, 1);
  harness.flushRaf();
  assertActiveSidebarHref(harness, "#company-model");

  harness.setHeadingTop("company-model", -300);
  harness.setHeadingTop("delivery-model", 40);
  harness.setHeadingTop("写 posture", 520);
  harness.dispatch("scroll");
  assert.equal(harness.rafCallbacks.length, 1);
  harness.flushRaf();
  assertActiveSidebarHref(harness, "#delivery-model");

  harness.window.location.hash = "#%E5%86%99%20posture";
  harness.dispatch("hashchange");
  assertActiveSidebarHref(harness, "#%E5%86%99%20posture");

  sidebarLinks(harness)[0].click();
  assertActiveSidebarHref(harness, "#company-model");

  sidebarLinks(harness).at(-1).click();
  assertActiveSidebarHref(harness, null);

  harness.window.location.hash = "#missing-target";
  harness.dispatch("hashchange");
  assertActiveSidebarHref(harness, null);
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

  const uppercaseEvent = dispatchSidebarShortcut(opener, { ctrlKey: true, key: "B" });
  assert.equal(uppercaseEvent.defaultPrevented, true);
  assertSidebarState(harness, "closed");
  assert.equal(harness.window.localStorage.getItem(SIDEBAR_STORAGE_KEY), "closed");
  assertNoClientErrors(harness.errors);
}

function testDocsSidebarPersistsAcrossReload() {
  const localStorage = createMemoryStorage();
  const first = createSidebarHarness({ localStorage });
  const opener = first.document.body;

  const event = dispatchSidebarShortcut(opener, { ctrlKey: true });
  assert.equal(event.defaultPrevented, true);
  assertSidebarState(first, "closed");
  assert.equal(first.window.localStorage.getItem(SIDEBAR_STORAGE_KEY), "closed");
  assertNoClientErrors(first.errors);

  const second = createSidebarHarness({ localStorage });

  assertSidebarState(second, "closed");
  assert.equal(second.window.localStorage.getItem(SIDEBAR_STORAGE_KEY), "closed");
  assertNoClientErrors(second.errors);
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

function testDocsSidebarEmptyHeadingState() {
  const harness = createSidebarHarness({
    html: `<!doctype html>
      <html>
        <body>
          <div class="article-shell" data-docs-sidebar-shell data-docs-sidebar-empty>
            <aside data-docs-sidebar data-docs-sidebar-state="open" data-docs-sidebar-empty>
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
                <h2>No id heading</h2>
                <p>Not linkable.</p>
              </section>
            </div>
          </div>
        </body>
      </html>`
  });

  assert.deepEqual(sidebarLinks(harness), []);
  assert.equal(harness.sidebar.hasAttribute("data-docs-sidebar-empty"), true);
  assert.equal(harness.sidebarShell.hasAttribute("data-docs-sidebar-empty"), true);
  assert.equal(harness.sidebarPanel.hasAttribute("hidden"), true);
  assert.equal(harness.sidebarToggle.disabled, true);
  assert.equal(harness.sidebarToggle.getAttribute("aria-expanded"), "false");
  assertNoClientErrors(harness.errors);
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
    testBuiltArticlePagesRenderDocsSidebarNavigation,
    testNonArticlePagesDoNotRunDocsSidebarContract,
    testQuestionOpensAndCloseButtonRestoresFocus,
    testEscapeCancelClosesAndRestoresFocus,
    testEditableTargetsDoNotOpenHelpOrToggleSidebar,
    testDocsSidebarShortcutRejectsNonMatchingKeys,
    testBackdropClickClosesOnlyOutsidePanel,
    testDocsSidebarInitialStateBuildsNavigation,
    testDocsSidebarInitialHashActivatesDecodedTarget,
    testDocsSidebarScrollHashAndClickActiveState,
    testDocsSidebarPersistedClosedState,
    testDocsSidebarShortcutTogglesAndPersists,
    testDocsSidebarPersistsAcrossReload,
    testDocsSidebarButtonTogglesAndPersists,
    testDocsSidebarStorageFailureFallback,
    testDocsSidebarEmptyHeadingState,
    testQuestionHelpCoexistsWithDocsSidebarShortcut,
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok KEYBOARD_SHORTCUTS_BEHAVIOR tests=${tests.length}`);
}

main();
