#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const SCRIPT_PATH = path.join(__dirname, "..", "src", "assets", "js", "theme.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");
const STORAGE_KEY = "fkst-theme";
const TOGGLE_SELECTOR = "[data-theme-toggle-button]";

function createHarness(options = {}) {
  const errors = [];
  const dom = new JSDOM(`<!doctype html>
    <html>
      <body>
        <header class="site-header">
          <button
            class="theme-toggle-button"
            type="button"
            role="switch"
            data-theme-toggle-button
            aria-label="Switch to dark theme"
            aria-checked="false"
          >
            <span class="theme-toggle-track" aria-hidden="true">
              <span class="theme-toggle-knob"></span>
            </span>
          </button>
        </header>
      </body>
    </html>`, {
    runScripts: "outside-only",
    url: "https://fkst.local/"
  });

  const { window } = dom;
  window.addEventListener("error", (event) => {
    errors.push(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    errors.push(event.reason);
  });

  if (options.localStorageValue !== undefined) {
    window.localStorage.setItem(STORAGE_KEY, options.localStorageValue);
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
    window.eval(SCRIPT_SOURCE);
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  } catch (error) {
    errors.push(error);
  }

  return {
    button: window.document.querySelector(TOGGLE_SELECTOR),
    document: window.document,
    errors,
    window
  };
}

function assertNoClientErrors(errors) {
  assert.deepEqual(errors, []);
}

function assertRootTheme(document, expected) {
  assert.equal(document.documentElement.hasAttribute("data-theme"), expected.hasDataTheme);
  assert.equal(document.documentElement.getAttribute("data-theme"), expected.dataTheme);
  assert.equal(document.documentElement.style.colorScheme, expected.colorScheme);
}

function assertButtonState(button, expected) {
  assert.deepEqual(
    {
      ariaChecked: button.getAttribute("aria-checked"),
      ariaLabel: button.getAttribute("aria-label"),
      dataTheme: button.getAttribute("data-theme"),
      disabled: button.hasAttribute("disabled")
    },
    expected
  );
}

function click(button, errors) {
  try {
    button.click();
  } catch (error) {
    errors.push(error);
  }
}

test("missing stored preference applies the default light theme", () => {
  const { button, document, errors, window } = createHarness();

  assert.equal(window.fkstTheme.readTheme(), "light");
  assertRootTheme(document, {
    hasDataTheme: true,
    dataTheme: "light",
    colorScheme: "light"
  });
  assertButtonState(button, {
    ariaChecked: "false",
    ariaLabel: "Switch to dark theme",
    dataTheme: "light",
    disabled: false
  });
  assertNoClientErrors(errors);
});

test("invalid stored preference falls back to the default light theme", () => {
  const { button, document, errors, window } = createHarness({
    localStorageValue: "solarized"
  });

  assert.equal(window.fkstTheme.readTheme(), "light");
  assert.equal(window.localStorage.getItem(STORAGE_KEY), "solarized");
  assertRootTheme(document, {
    hasDataTheme: true,
    dataTheme: "light",
    colorScheme: "light"
  });
  assertButtonState(button, {
    ariaChecked: "false",
    ariaLabel: "Switch to dark theme",
    dataTheme: "light",
    disabled: false
  });
  assertNoClientErrors(errors);
});

test("storage read failure falls back to the default light theme without client errors", () => {
  const { button, document, errors, window } = createHarness({
    getItemThrows: true
  });

  assert.equal(window.fkstTheme.readTheme(), "light");
  assertRootTheme(document, {
    hasDataTheme: true,
    dataTheme: "light",
    colorScheme: "light"
  });
  assertButtonState(button, {
    ariaChecked: "false",
    ariaLabel: "Switch to dark theme",
    dataTheme: "light",
    disabled: false
  });
  assertNoClientErrors(errors);
});

test("unavailable storage falls back to the default light theme without client errors", () => {
  const { button, document, errors, window } = createHarness({
    localStorageThrows: true
  });

  assert.equal(window.fkstTheme.readTheme(), "light");
  assertRootTheme(document, {
    hasDataTheme: true,
    dataTheme: "light",
    colorScheme: "light"
  });
  assertButtonState(button, {
    ariaChecked: "false",
    ariaLabel: "Switch to dark theme",
    dataTheme: "light",
    disabled: false
  });

  click(button, errors);

  assertRootTheme(document, {
    hasDataTheme: true,
    dataTheme: "dark",
    colorScheme: "dark"
  });
  assertButtonState(button, {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });
  assertNoClientErrors(errors);
});

test("stored light preference restores light on load", () => {
  const { button, document, errors, window } = createHarness({
    localStorageValue: "light"
  });

  assert.equal(window.fkstTheme.readTheme(), "light");
  assertRootTheme(document, {
    hasDataTheme: true,
    dataTheme: "light",
    colorScheme: "light"
  });
  assertButtonState(button, {
    ariaChecked: "false",
    ariaLabel: "Switch to dark theme",
    dataTheme: "light",
    disabled: false
  });
  assertNoClientErrors(errors);
});

test("stored dark preference restores dark on load", () => {
  const { button, document, errors, window } = createHarness({
    localStorageValue: "dark"
  });

  assert.equal(window.fkstTheme.readTheme(), "dark");
  assertRootTheme(document, {
    hasDataTheme: true,
    dataTheme: "dark",
    colorScheme: "dark"
  });
  assertButtonState(button, {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });
  assertNoClientErrors(errors);
});

test("clicking toggles document theme, persistence, and accessibility state", () => {
  const { button, document, errors, window } = createHarness();

  click(button, errors);

  assertRootTheme(document, {
    hasDataTheme: true,
    dataTheme: "dark",
    colorScheme: "dark"
  });
  assert.equal(window.localStorage.getItem(STORAGE_KEY), "dark");
  assertButtonState(button, {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });

  click(button, errors);

  assertRootTheme(document, {
    hasDataTheme: true,
    dataTheme: "light",
    colorScheme: "light"
  });
  assert.equal(window.localStorage.getItem(STORAGE_KEY), "light");
  assertButtonState(button, {
    ariaChecked: "false",
    ariaLabel: "Switch to dark theme",
    dataTheme: "light",
    disabled: false
  });
  assertNoClientErrors(errors);
});

test("persisted click choice is restored on the next mount", () => {
  const firstMount = createHarness();

  click(firstMount.button, firstMount.errors);

  assertRootTheme(firstMount.document, {
    hasDataTheme: true,
    dataTheme: "dark",
    colorScheme: "dark"
  });
  assert.equal(firstMount.window.localStorage.getItem(STORAGE_KEY), "dark");
  assertNoClientErrors(firstMount.errors);

  const secondMount = createHarness({
    localStorageValue: firstMount.window.localStorage.getItem(STORAGE_KEY)
  });

  assertRootTheme(secondMount.document, {
    hasDataTheme: true,
    dataTheme: "dark",
    colorScheme: "dark"
  });
  assert.equal(secondMount.window.fkstTheme.readTheme(), "dark");
  assertButtonState(secondMount.button, {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });
  assertNoClientErrors(secondMount.errors);
});

test("storage write failure still applies the active theme without client errors", () => {
  const { button, document, errors, window } = createHarness({ setItemThrows: true });

  click(button, errors);

  assertRootTheme(document, {
    hasDataTheme: true,
    dataTheme: "dark",
    colorScheme: "dark"
  });
  assert.equal(window.localStorage.getItem(STORAGE_KEY), null);
  assert.equal(window.fkstTheme.readTheme(), "light");
  assertButtonState(button, {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });
  assertNoClientErrors(errors);
});
