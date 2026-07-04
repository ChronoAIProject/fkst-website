#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT_PATH = path.join(ROOT, "site", "src", "assets", "js", "table-of-contents.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

class MiniElement {
  constructor(tagName, attrs = {}, children = []) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.ownerDocument = null;
    this.top = 0;
    this._text = "";

    for (const [name, value] of Object.entries(attrs)) {
      this.setAttribute(name, value);
    }

    for (const child of children) {
      this.append(child);
    }
  }

  append(child) {
    if (typeof child === "string") {
      this._text += child;
      return;
    }

    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    child.visit((descendant) => {
      descendant.ownerDocument = this.ownerDocument;
    });
    this.children.push(child);
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

  getBoundingClientRect() {
    return {
      top: this.top
    };
  }

  get id() {
    return this.getAttribute("id") || "";
  }
}

class MiniDocument {
  constructor(body) {
    this.body = body;
    this.attach(body);
  }

  attach(element) {
    element.ownerDocument = this;
    for (const child of element.children) {
      this.attach(child);
    }
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

  getElementById(id) {
    let found = null;
    this.body.visit((element) => {
      if (!found && element.id === id) {
        found = element;
      }
    });
    return found;
  }
}

function matchesSelector(element, selector) {
  if (selector === "[data-toc-nav]") {
    return element.hasAttribute("data-toc-nav");
  }
  if (selector === "[data-toc-link]") {
    return element.hasAttribute("data-toc-link");
  }
  throw new Error(`unsupported selector in test DOM: ${selector}`);
}

function element(tagName, attrs = {}, children = []) {
  return new MiniElement(tagName, attrs, children);
}

function createScheduler() {
  const animationFrames = [];
  const timeouts = [];
  let nextId = 1;

  return {
    requestAnimationFrame(callback) {
      const id = nextId;
      nextId += 1;
      animationFrames.push({ id, callback });
      return id;
    },
    setTimeout(callback) {
      const id = nextId;
      nextId += 1;
      timeouts.push({ id, callback });
      return id;
    },
    flushAnimationFrame() {
      assert.ok(animationFrames.length > 0, "expected a queued animation frame");
      const frame = animationFrames.shift();
      frame.callback();
    },
    flushTimeout() {
      assert.ok(timeouts.length > 0, "expected a queued timeout");
      const timeout = timeouts.shift();
      timeout.callback();
    },
    counts() {
      return {
        animationFrames: animationFrames.length,
        timeouts: timeouts.length
      };
    }
  };
}

function createTocHarness(options = {}) {
  const headings = {
    intro: element("h2", { id: "intro" }),
    nested: element("h3", { id: "nested" }),
    encoded: element("h2", { id: "encoded section" })
  };
  const links = {
    intro: element("a", {
      "data-toc-link": "",
      href: "#intro"
    }),
    nested: element("a", {
      "data-toc-link": "",
      href: "#nested"
    }),
    encoded: element("a", {
      "data-toc-link": "",
      href: "#encoded%20section"
    }),
    missing: element("a", {
      "data-toc-link": "",
      href: "#missing"
    })
  };
  const nav = element("nav", { "data-toc-nav": "" }, [
    links.intro,
    links.nested,
    links.encoded,
    links.missing
  ]);
  const body = element("body", {}, [
    nav,
    headings.intro,
    headings.nested,
    headings.encoded
  ]);
  const document = new MiniDocument(body);
  const scheduler = createScheduler();
  const listeners = new Map();
  const window = {
    document,
    location: {
      hash: options.hash || ""
    },
    addEventListener(type, listener, listenerOptions) {
      const existing = listeners.get(type) || [];
      existing.push({
        listener,
        options: listenerOptions
      });
      listeners.set(type, existing);
    },
    requestAnimationFrame: scheduler.requestAnimationFrame,
    setTimeout: scheduler.setTimeout
  };
  const sandbox = {
    document,
    window,
    Array,
    decodeURIComponent
  };

  vm.runInNewContext(SCRIPT_SOURCE, sandbox, {
    filename: SCRIPT_PATH
  });

  return {
    document,
    headings,
    links,
    listeners,
    nav,
    scheduler,
    window
  };
}

function dispatchWindowEvent(harness, type) {
  const listeners = harness.listeners.get(type) || [];
  for (const { listener } of listeners) {
    listener.call(harness.window, {
      type
    });
  }
}

function currentLinks(links) {
  return Object.entries(links)
    .filter(([_name, link]) => link.getAttribute("aria-current") === "location")
    .map(([name]) => name);
}

function assertOnlyCurrent(links, expectedName) {
  assert.deepEqual(currentLinks(links), [expectedName]);
  for (const [name, link] of Object.entries(links)) {
    const shouldBeCurrent = name === expectedName;
    assert.equal(link.hasAttribute("data-toc-current"), shouldBeCurrent);
  }
}

function setHeadingTops(headings, tops) {
  for (const [name, top] of Object.entries(tops)) {
    headings[name].top = top;
  }
}

function testInitialHashActivationAndDecodedFragmentIds() {
  const harness = createTocHarness({
    hash: "#encoded%20section"
  });

  assertOnlyCurrent(harness.links, "encoded");
  assert.deepEqual(harness.scheduler.counts(), {
    animationFrames: 0,
    timeouts: 1
  });

  setHeadingTops(harness.headings, {
    intro: 0,
    nested: 40,
    encoded: 220
  });
  harness.scheduler.flushTimeout();
  harness.scheduler.flushAnimationFrame();
  assertOnlyCurrent(harness.links, "nested");
}

function testInitialScrollActivationWhenHashIsMissing() {
  const harness = createTocHarness({
    hash: "#missing"
  });

  assert.deepEqual(currentLinks(harness.links), []);
  assert.deepEqual(harness.scheduler.counts(), {
    animationFrames: 0,
    timeouts: 1
  });

  setHeadingTops(harness.headings, {
    intro: 0,
    nested: 120,
    encoded: 240
  });
  harness.scheduler.flushTimeout();
  harness.scheduler.flushAnimationFrame();
  assertOnlyCurrent(harness.links, "intro");
  assert.equal(harness.links.missing.getAttribute("aria-current"), null);
}

function testScrollUpdatesActiveLinkAndCleansPreviousActiveLink() {
  const harness = createTocHarness();

  setHeadingTops(harness.headings, {
    intro: 0,
    nested: 180,
    encoded: 260
  });
  harness.scheduler.flushAnimationFrame();
  assertOnlyCurrent(harness.links, "intro");

  setHeadingTops(harness.headings, {
    intro: -300,
    nested: 80,
    encoded: 130
  });
  dispatchWindowEvent(harness, "scroll");
  dispatchWindowEvent(harness, "scroll");
  assert.equal(harness.scheduler.counts().animationFrames, 1);
  harness.scheduler.flushAnimationFrame();
  assertOnlyCurrent(harness.links, "nested");
  assert.equal(harness.links.intro.getAttribute("aria-current"), null);
  assert.equal(harness.links.intro.hasAttribute("data-toc-current"), false);
}

function testHashchangeActivation() {
  const harness = createTocHarness();

  setHeadingTops(harness.headings, {
    intro: 0,
    nested: 220,
    encoded: 260
  });
  harness.scheduler.flushAnimationFrame();
  assertOnlyCurrent(harness.links, "intro");

  harness.window.location.hash = "#nested";
  dispatchWindowEvent(harness, "hashchange");
  assertOnlyCurrent(harness.links, "nested");
  assert.equal(harness.scheduler.counts().timeouts, 1);
}

function testResizeUsesScrollSelection() {
  const harness = createTocHarness();

  setHeadingTops(harness.headings, {
    intro: 0,
    nested: 0,
    encoded: 90
  });
  harness.scheduler.flushAnimationFrame();
  assertOnlyCurrent(harness.links, "encoded");

  setHeadingTops(harness.headings, {
    intro: 0,
    nested: 140,
    encoded: 260
  });
  dispatchWindowEvent(harness, "resize");
  harness.scheduler.flushAnimationFrame();
  assertOnlyCurrent(harness.links, "intro");
}

function testNoNavsDoesNothing() {
  const body = element("body");
  const document = new MiniDocument(body);
  const scheduler = createScheduler();
  const listeners = new Map();
  const window = {
    document,
    location: {
      hash: ""
    },
    addEventListener(type, listener) {
      const existing = listeners.get(type) || [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    requestAnimationFrame: scheduler.requestAnimationFrame,
    setTimeout: scheduler.setTimeout
  };

  vm.runInNewContext(SCRIPT_SOURCE, {
    document,
    window,
    Array,
    decodeURIComponent
  }, {
    filename: SCRIPT_PATH
  });

  assert.equal(listeners.size, 0);
  assert.deepEqual(scheduler.counts(), {
    animationFrames: 0,
    timeouts: 0
  });
}

function testNavWithOnlyMissingTargetsDoesNothing() {
  const link = element("a", {
    "data-toc-link": "",
    href: "#missing"
  });
  const nav = element("nav", { "data-toc-nav": "" }, [link]);
  const body = element("body", {}, [nav]);
  const document = new MiniDocument(body);
  const scheduler = createScheduler();
  const listeners = new Map();
  const window = {
    document,
    location: {
      hash: "#missing"
    },
    addEventListener(type, listener) {
      const existing = listeners.get(type) || [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    requestAnimationFrame: scheduler.requestAnimationFrame,
    setTimeout: scheduler.setTimeout
  };

  vm.runInNewContext(SCRIPT_SOURCE, {
    document,
    window,
    Array,
    decodeURIComponent
  }, {
    filename: SCRIPT_PATH
  });

  assert.equal(link.getAttribute("aria-current"), null);
  assert.equal(link.hasAttribute("data-toc-current"), false);
  assert.equal(listeners.size, 0);
  assert.deepEqual(scheduler.counts(), {
    animationFrames: 0,
    timeouts: 0
  });
}

function main() {
  const tests = [
    testInitialHashActivationAndDecodedFragmentIds,
    testInitialScrollActivationWhenHashIsMissing,
    testScrollUpdatesActiveLinkAndCleansPreviousActiveLink,
    testHashchangeActivation,
    testResizeUsesScrollSelection,
    testNoNavsDoesNothing,
    testNavWithOnlyMissingTargetsDoesNothing
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok TABLE_OF_CONTENTS_BEHAVIOR tests=${tests.length}`);
}

main();
