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
const STORAGE_KEY = "fkst-theme";
const TOGGLE_SELECTOR = "[data-theme-toggle-button]";

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
    const bootScripts = document.querySelectorAll("script[data-theme-boot-script]");
    const scripts = document.querySelectorAll("script[data-theme-script]");

    assert.equal(controls.length, 1, `${route}: expected one theme toggle control`);
    assert.equal(buttons.length, 1, `${route}: expected one theme toggle button`);
    assert.equal(bootScripts.length, 1, `${route}: expected one theme boot script`);
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

    const bootScript = bootScripts[0].textContent.replace(/\s+/g, " ");
    assert.ok(bootScript.includes("fkst-theme"), `${route}: boot script missing storage key`);
    assert.ok(bootScript.includes("data-theme"), `${route}: boot script missing root theme hook`);
    assert.ok(bootScript.includes("localStorage.getItem"), `${route}: boot script must restore stored theme`);
  }
}

function testStylesheetExposesExplicitThemeHooks() {
  const style = fs.readFileSync(STYLE_OUTPUT_PATH, "utf8").replace(/\s+/g, " ");
  const requiredNeedles = [
    '[data-theme="dark"]',
    '[data-theme="light"]',
    ':root:not([data-theme="light"])',
    'prefers-color-scheme',
    '.theme-toggle-button[aria-checked="true"] .theme-toggle-knob',
    'transform: translateX(20px)'
  ];

  for (const needle of requiredNeedles) {
    assert.ok(style.includes(needle), `stylesheet missing theme contract: ${needle}`);
  }
}

function routeUrl(route) {
  const cleanRoute = route.replace(/^\/+/, "");
  const prefixedPath = cleanRoute ? `/fkst-website/${cleanRoute}` : "/fkst-website/";
  return new URL(prefixedPath, "https://chronoaiproject.github.io").href;
}

function configureThemeHarness(window, errors, options = {}) {
  window.addEventListener("error", (event) => {
    errors.push(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    errors.push(event.reason);
  });

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
}

function runScript(window, errors, source) {
  try {
    window.eval(source);
  } catch (error) {
    errors.push(error);
  }
}

function runBootScript(window, errors, route) {
  const bootScript = window.document.querySelector("script[data-theme-boot-script]");
  assert.ok(bootScript, `${route}: missing theme boot script`);
  runScript(window, errors, bootScript.textContent);
}

function runDeferredThemeScript(window, errors) {
  runScript(window, errors, fs.readFileSync(SCRIPT_OUTPUT_PATH, "utf8"));
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
}

function createThemeHarness(route, options = {}) {
  const errors = [];
  const dom = new JSDOM(fs.readFileSync(outputPath(route), "utf8"), {
    runScripts: "outside-only",
    url: routeUrl(route)
  });
  const { window } = dom;

  configureThemeHarness(window, errors, options);
  runBootScript(window, errors, route);
  if (options.runDeferredThemeScript) {
    runDeferredThemeScript(window, errors);
  }

  return {
    button: window.document.querySelector(TOGGLE_SELECTOR),
    document: window.document,
    errors,
    window
  };
}

function assertBootState(route, label, harness, expected) {
  const { document, errors, window } = harness;
  assert.deepEqual(errors, [], `${route}: boot script errored for ${label}`);
  assert.equal(
    document.documentElement.hasAttribute("data-theme"),
    expected.hasDataTheme,
    `${route}: root data-theme presence mismatch for ${label}`
  );
  assert.equal(
    document.documentElement.getAttribute("data-theme"),
    expected.dataTheme,
    `${route}: root data-theme value mismatch for ${label}`
  );
  assert.equal(
    document.documentElement.style.colorScheme,
    expected.colorScheme,
    `${route}: root colorScheme mismatch for ${label}`
  );
  assert.equal(
    window.fkstTheme,
    undefined,
    `${route}: deferred theme script should not run during boot check for ${label}`
  );
}

function testBootScriptRestoresStoredThemeBeforeDeferredScript() {
  const bootScenarios = [
    {
      label: "stored light",
      options: { localStorageValue: "light" },
      expected: { hasDataTheme: true, dataTheme: "light", colorScheme: "light" }
    },
    {
      label: "stored dark",
      options: { localStorageValue: "dark" },
      expected: { hasDataTheme: true, dataTheme: "dark", colorScheme: "dark" }
    },
    {
      label: "missing preference",
      options: {},
      expected: { hasDataTheme: false, dataTheme: null, colorScheme: "" }
    },
    {
      label: "invalid stored preference",
      options: { localStorageValue: "solarized" },
      expected: { hasDataTheme: false, dataTheme: null, colorScheme: "" }
    },
    {
      label: "unavailable storage",
      options: { localStorageThrows: true },
      expected: { hasDataTheme: false, dataTheme: null, colorScheme: "" }
    },
    {
      label: "storage read failure",
      options: { getItemThrows: true },
      expected: { hasDataTheme: false, dataTheme: null, colorScheme: "" }
    }
  ];

  for (const route of manifestRoutes()) {
    for (const scenario of bootScenarios) {
      assertBootState(
        route,
        scenario.label,
        createThemeHarness(route, scenario.options),
        scenario.expected
      );
    }
  }
}

function assertNoClientErrors(route, label, errors) {
  assert.deepEqual(errors, [], `${route}: deferred theme script errored for ${label}`);
}

function assertRootTheme(route, label, document, expected) {
  assert.equal(
    document.documentElement.hasAttribute("data-theme"),
    expected.hasDataTheme,
    `${route}: root data-theme presence mismatch for ${label}`
  );
  assert.equal(
    document.documentElement.getAttribute("data-theme"),
    expected.dataTheme,
    `${route}: root data-theme value mismatch for ${label}`
  );
  assert.equal(
    document.documentElement.style.colorScheme,
    expected.colorScheme,
    `${route}: root colorScheme mismatch for ${label}`
  );
}

function assertButtonState(route, label, button, expected) {
  assert.ok(button, `${route}: missing theme toggle button for ${label}`);
  assert.deepEqual(
    {
      ariaChecked: button.getAttribute("aria-checked"),
      ariaLabel: button.getAttribute("aria-label"),
      dataTheme: button.getAttribute("data-theme"),
      disabled: button.hasAttribute("disabled")
    },
    expected,
    `${route}: toggle state mismatch for ${label}`
  );
}

function clickThemeToggle(harness) {
  try {
    harness.button.click();
  } catch (error) {
    harness.errors.push(error);
  }
}

function assertDeferredThemeInitializedFromInvalidStorage(route) {
  const label = "invalid stored preference";
  const harness = createThemeHarness(route, {
    localStorageValue: "solarized",
    prefersDark: true,
    runDeferredThemeScript: true
  });

  assert.equal(
    harness.window.localStorage.getItem(STORAGE_KEY),
    "solarized",
    `${route}: unsupported stored theme must not be rewritten`
  );
  assert.equal(harness.window.fkstTheme.readTheme(), "dark", `${route}: invalid storage must fall back to system`);
  assertRootTheme(route, label, harness.document, {
    hasDataTheme: false,
    dataTheme: null,
    colorScheme: ""
  });
  assertButtonState(route, label, harness.button, {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });
  assertNoClientErrors(route, label, harness.errors);
}

function assertDeferredThemeClickRoundTrip(route) {
  const label = "click round trip";
  const harness = createThemeHarness(route, { runDeferredThemeScript: true });

  clickThemeToggle(harness);
  assertRootTheme(route, "click to dark", harness.document, {
    hasDataTheme: true,
    dataTheme: "dark",
    colorScheme: "dark"
  });
  assert.equal(harness.window.localStorage.getItem(STORAGE_KEY), "dark", `${route}: click must persist dark`);
  assertButtonState(route, "click to dark", harness.button, {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });

  clickThemeToggle(harness);
  assertRootTheme(route, "click back to light", harness.document, {
    hasDataTheme: true,
    dataTheme: "light",
    colorScheme: "light"
  });
  assert.equal(harness.window.localStorage.getItem(STORAGE_KEY), "light", `${route}: click must persist light`);
  assertButtonState(route, "click back to light", harness.button, {
    ariaChecked: "false",
    ariaLabel: "Switch to dark theme",
    dataTheme: "light",
    disabled: false
  });
  assertNoClientErrors(route, label, harness.errors);
}

function assertDeferredThemeRestoresPersistedChoice(route) {
  const firstMount = createThemeHarness(route, { runDeferredThemeScript: true });
  clickThemeToggle(firstMount);
  const storedTheme = firstMount.window.localStorage.getItem(STORAGE_KEY);
  assert.equal(storedTheme, "dark", `${route}: first mount must persist dark before remount`);
  assertNoClientErrors(route, "first mount persisted choice", firstMount.errors);

  const secondMount = createThemeHarness(route, {
    localStorageValue: storedTheme,
    runDeferredThemeScript: true
  });

  assert.equal(secondMount.window.fkstTheme.readTheme(), "dark", `${route}: remount must read persisted dark`);
  assertRootTheme(route, "remount persisted choice", secondMount.document, {
    hasDataTheme: true,
    dataTheme: "dark",
    colorScheme: "dark"
  });
  assertButtonState(route, "remount persisted choice", secondMount.button, {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });
  assertNoClientErrors(route, "remount persisted choice", secondMount.errors);
}

function assertDeferredThemeWriteFailureAppliesInMemory(route) {
  const label = "storage write failure";
  const harness = createThemeHarness(route, {
    runDeferredThemeScript: true,
    setItemThrows: true
  });

  clickThemeToggle(harness);

  assertRootTheme(route, label, harness.document, {
    hasDataTheme: true,
    dataTheme: "dark",
    colorScheme: "dark"
  });
  assert.equal(harness.window.localStorage.getItem(STORAGE_KEY), null, `${route}: failed write must not store theme`);
  assert.equal(harness.window.fkstTheme.readTheme(), "light", `${route}: failed write must keep storage fallback`);
  assertButtonState(route, label, harness.button, {
    ariaChecked: "true",
    ariaLabel: "Switch to light theme",
    dataTheme: "dark",
    disabled: false
  });
  assertNoClientErrors(route, label, harness.errors);
}

function testDeferredThemeScriptInteractions() {
  for (const route of manifestRoutes()) {
    assertDeferredThemeInitializedFromInvalidStorage(route);
    assertDeferredThemeClickRoundTrip(route);
    assertDeferredThemeRestoresPersistedChoice(route);
    assertDeferredThemeWriteFailureAppliesInMemory(route);
  }
}

function main() {
  const tests = [
    testBuiltPagesIncludeOneEnabledToggleAndScript,
    testStylesheetExposesExplicitThemeHooks,
    testBootScriptRestoresStoredThemeBeforeDeferredScript,
    testDeferredThemeScriptInteractions
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok THEME_TOGGLE_BEHAVIOR tests=${tests.length}`);
}

main();
