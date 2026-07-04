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
const SCRIPT_PATH = path.join(SITE_ROOT, "src", "assets", "js", "theme.js");
const SCRIPT_OUTPUT_PATH = path.join(SITE_OUTPUT, "assets", "js", "theme.js");
const STYLE_OUTPUT_PATH = path.join(SITE_OUTPUT, "assets", "css", "style.css");
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
    window.localStorage.setItem("fkst-theme", options.localStorageValue);
  }
  if (options.localStorageThrows) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("localStorage unavailable");
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
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value(query) {
      return {
        addEventListener() {},
        addListener() {},
        dispatchEvent() {
          return false;
        },
        matches: Boolean(options.prefersDark) && query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        removeEventListener() {},
        removeListener() {}
      };
    }
  });

  window.eval(SCRIPT_SOURCE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  return {
    document: window.document,
    errors,
    window
  };
}

function assertNoClientErrors(errors) {
  assert.deepEqual(errors, []);
}

function buttonState(button) {
  return {
    ariaChecked: button.getAttribute("aria-checked"),
    ariaLabel: button.getAttribute("aria-label"),
    dataTheme: button.getAttribute("data-theme"),
    disabled: button.hasAttribute("disabled")
  };
}

function testBuiltPagesIncludeOneEnabledToggleAndScript() {
  assert.equal(fs.existsSync(SCRIPT_OUTPUT_PATH), true, `missing built script ${SCRIPT_OUTPUT_PATH}`);
  assert.equal(fs.readFileSync(SCRIPT_OUTPUT_PATH, "utf8"), SCRIPT_SOURCE);

  for (const route of manifestRoutes()) {
    const pagePath = outputPath(route);
    const html = fs.readFileSync(pagePath, "utf8");
    const dom = new JSDOM(html);
    const { document } = dom.window;
    const header = document.querySelector("header.site-header");
    assert.ok(header, `${route}: missing site header`);

    const controls = header.querySelectorAll("[data-theme-toggle-control]");
    const buttons = header.querySelectorAll("[data-theme-toggle-button]");
    const scripts = document.querySelectorAll("script[data-theme-script]");

    assert.equal(controls.length, 1, `${route}: expected one theme toggle control`);
    assert.equal(buttons.length, 1, `${route}: expected one theme toggle button`);
    assert.equal(scripts.length, 1, `${route}: expected one theme script`);

    const button = buttons[0];
    assert.equal(button.tagName, "BUTTON", `${route}: toggle must be a button`);
    assert.equal(button.getAttribute("type"), "button", `${route}: toggle type mismatch`);
    assert.equal(button.getAttribute("role"), "switch", `${route}: toggle role mismatch`);
    assert.equal(button.getAttribute("aria-checked"), "false", `${route}: initial aria-checked mismatch`);
    assert.equal(button.getAttribute("aria-label"), "Switch to dark theme", `${route}: initial label mismatch`);
    assert.equal(button.hasAttribute("disabled"), false, `${route}: toggle must be enabled`);

    const script = scripts[0];
    assert.match(script.getAttribute("src") || "", /\/assets\/js\/theme\.js$/, `${route}: script path mismatch`);
    assert.equal(script.hasAttribute("defer"), true, `${route}: theme script must be deferred`);
  }
}

function testMissingThemeLeavesSystemFallbackInControl() {
  const { document, errors, window } = createHarness();
  const button = document.querySelector("[data-theme-toggle-button]");

  assert.equal(window.fkstTheme.defaultTheme, "light");
  assert.deepEqual([...window.fkstTheme.supportedThemes], ["light", "dark"]);
  assert.equal(window.fkstTheme.readTheme(), "light");
  assert.equal(document.documentElement.hasAttribute("data-theme"), false);
  assert.equal(document.documentElement.style.colorScheme, "");
  assert.deepEqual(buttonState(button), {
    ariaChecked: "false",
    ariaLabel: "Switch to dark theme",
    dataTheme: "light",
    disabled: false
  });
  assertNoClientErrors(errors);
}

function testMissingThemeReflectsSystemDarkWithoutOverride() {
  const { document, errors, window } = createHarness({ prefersDark: true });
  const button = document.querySelector("[data-theme-toggle-button]");

  assert.equal(window.fkstTheme.readTheme(), "dark");
  assert.equal(document.documentElement.hasAttribute("data-theme"), false);
  assert.equal(document.documentElement.style.colorScheme, "");
  assert.deepEqual(buttonState(button), {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });
  assertNoClientErrors(errors);
}

function testPersistedDarkThemeRestores() {
  const { document, errors, window } = createHarness({ localStorageValue: "dark" });
  const button = document.querySelector("[data-theme-toggle-button]");

  assert.equal(window.fkstTheme.readTheme(), "dark");
  assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
  assert.deepEqual(buttonState(button), {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });
  assertNoClientErrors(errors);
}

function testInvalidPersistedThemeFallsBack() {
  const { document, errors, window } = createHarness({ localStorageValue: "solarized" });
  const button = document.querySelector("[data-theme-toggle-button]");

  assert.equal(window.fkstTheme.readTheme(), "light");
  assert.equal(document.documentElement.hasAttribute("data-theme"), false);
  assert.equal(button.getAttribute("aria-checked"), "false");
  assertNoClientErrors(errors);
}

function testInvalidPersistedThemeReflectsSystemDarkWithoutOverride() {
  const { document, errors, window } = createHarness({
    localStorageValue: "solarized",
    prefersDark: true
  });
  const button = document.querySelector("[data-theme-toggle-button]");

  assert.equal(window.fkstTheme.readTheme(), "dark");
  assert.equal(document.documentElement.hasAttribute("data-theme"), false);
  assert.equal(button.getAttribute("aria-checked"), "true");
  assertNoClientErrors(errors);
}

function testClickTogglesAndPersists() {
  const { document, errors, window } = createHarness();
  const button = document.querySelector("[data-theme-toggle-button]");

  button.click();

  assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(window.localStorage.getItem("fkst-theme"), "dark");
  assert.deepEqual(buttonState(button), {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });

  button.click();

  assert.equal(document.documentElement.getAttribute("data-theme"), "light");
  assert.equal(window.localStorage.getItem("fkst-theme"), "light");
  assert.deepEqual(buttonState(button), {
    ariaChecked: "false",
    ariaLabel: "Switch to dark theme",
    dataTheme: "light",
    disabled: false
  });
  assertNoClientErrors(errors);
}

function testStorageUnavailableDoesNotThrow() {
  const { document, errors, window } = createHarness({
    localStorageThrows: true,
    prefersDark: true
  });
  const button = document.querySelector("[data-theme-toggle-button]");

  assert.equal(window.fkstTheme.readTheme(), "dark");
  assert.equal(document.documentElement.hasAttribute("data-theme"), false);
  assert.equal(button.getAttribute("aria-checked"), "true");

  button.click();

  assert.equal(document.documentElement.getAttribute("data-theme"), "light");
  assert.equal(button.getAttribute("aria-checked"), "false");
  assertNoClientErrors(errors);
}

function testStorageWriteFailureStillAppliesTheme() {
  const { document, errors, window } = createHarness({ setItemThrows: true });
  const button = document.querySelector("[data-theme-toggle-button]");

  button.click();

  assert.equal(window.fkstTheme.readTheme(), "light");
  assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(button.getAttribute("aria-checked"), "true");
  assertNoClientErrors(errors);
}

function testStylesheetExposesExplicitThemeHooks() {
  const style = fs.readFileSync(STYLE_OUTPUT_PATH, "utf8").replace(/\s+/g, " ");
  const requiredNeedles = [
    '[data-theme="dark"]',
    '[data-theme="light"]',
    ':root:not([data-theme="light"])',
    '.theme-toggle-button[aria-checked="true"] .theme-toggle-knob',
    'transform: translateX(20px)'
  ];

  for (const needle of requiredNeedles) {
    assert.ok(style.includes(needle), `stylesheet missing theme contract: ${needle}`);
  }
}

function main() {
  const tests = [
    testBuiltPagesIncludeOneEnabledToggleAndScript,
    testMissingThemeLeavesSystemFallbackInControl,
    testMissingThemeReflectsSystemDarkWithoutOverride,
    testPersistedDarkThemeRestores,
    testInvalidPersistedThemeFallsBack,
    testInvalidPersistedThemeReflectsSystemDarkWithoutOverride,
    testClickTogglesAndPersists,
    testStorageUnavailableDoesNotThrow,
    testStorageWriteFailureStillAppliesTheme,
    testStylesheetExposesExplicitThemeHooks
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok THEME_TOGGLE_BEHAVIOR tests=${tests.length}`);
}

main();
