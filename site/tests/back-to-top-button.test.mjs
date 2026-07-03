import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(siteRoot, "src", "assets", "js", "back-to-top-button.js");
const templatePath = path.join(
  siteRoot,
  "src",
  "_includes",
  "components",
  "back-to-top-button.njk"
);

function createEventTarget() {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
      const existing = listeners.get(type) || [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    removeEventListener(type, listener) {
      const existing = listeners.get(type) || [];
      listeners.set(
        type,
        existing.filter((candidate) => candidate !== listener)
      );
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) {
        listener();
      }
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    }
  };
}

function loadBackToTopButton() {
  const button = {
    ...createEventTarget(),
    hidden: false,
    _fkstBackToTopController: null
  };
  const documentEvents = createEventTarget();
  const fakeDocument = {
    ...documentEvents,
    readyState: "loading",
    documentElement: {
      contains() {
        return true;
      },
      scrollTop: 0
    },
    querySelector(selector) {
      return selector === "[data-back-to-top]" ? button : null;
    }
  };
  const windowEvents = createEventTarget();
  const fakeWindow = {
    ...windowEvents,
    document: fakeDocument,
    pageYOffset: 0,
    scrollToCalls: [],
    scrollY: 0,
    scrollTo(options) {
      this.scrollToCalls.push(options);
    }
  };
  const context = {
    document: fakeDocument,
    window: fakeWindow
  };

  vm.runInNewContext(fs.readFileSync(scriptPath, "utf-8"), context, {
    filename: scriptPath
  });
  fakeDocument.dispatch("DOMContentLoaded");

  return { button, fakeWindow };
}

test("back-to-top markup exposes a native accessible button", () => {
  const template = fs.readFileSync(templatePath, "utf-8");

  assert.match(template, /<button[\s\S]*type="button"/);
  assert.match(template, /aria-label="Back to top"/);
  assert.match(template, /data-back-to-top/);
  assert.match(template, /hidden/);
});

test("back-to-top button is hidden initially and toggles after scroll threshold", () => {
  const { button, fakeWindow } = loadBackToTopButton();

  assert.equal(button.hidden, true);

  fakeWindow.scrollY = 301;
  fakeWindow.dispatch("scroll");
  assert.equal(button.hidden, false);

  fakeWindow.scrollY = 40;
  fakeWindow.dispatch("scroll");
  assert.equal(button.hidden, true);
});

test("back-to-top button scrolls smoothly to the page top on activation", () => {
  const { button, fakeWindow } = loadBackToTopButton();

  button.dispatch("click");

  assert.equal(fakeWindow.scrollToCalls.length, 1);
  assert.equal(fakeWindow.scrollToCalls[0].top, 0);
  assert.equal(fakeWindow.scrollToCalls[0].behavior, "smooth");
});

test("back-to-top controller removes browser listeners on destroy", () => {
  const { button, fakeWindow } = loadBackToTopButton();

  assert.equal(fakeWindow.listenerCount("scroll"), 1);
  assert.equal(button.listenerCount("click"), 1);

  button._fkstBackToTopController.destroy();

  assert.equal(fakeWindow.listenerCount("scroll"), 0);
  assert.equal(button.listenerCount("click"), 0);
});
