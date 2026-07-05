#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const REGISTRY_PATH = path.join(__dirname, "..", "src", "_data", "locales.js");
const SCRIPT_PATH = path.join(__dirname, "..", "src", "assets", "js", "locale.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");
const STORAGE_KEY = "fkst-locale";
const DEFAULT_HTML = [
  "<!doctype html><html><body>",
  '<nav data-locale-switcher data-locale-current="en">',
  '<a href="/" data-locale-option data-locale-code="en" aria-current="page">EN</a>',
  '<a href="/zh/" data-locale-option data-locale-code="zh">中文</a>',
  "</nav>",
  "</body></html>",
].join("");
const CHINESE_HTML = [
  "<!doctype html><html><body>",
  '<nav data-locale-switcher data-locale-current="zh">',
  '<a href="/" data-locale-option data-locale-code="en">EN</a>',
  '<a href="/zh/" data-locale-option data-locale-code="zh" aria-current="page">中文</a>',
  "</nav>",
  "</body></html>",
].join("");

function createHarness(options = {}) {
  const errors = [];
  const dom = new JSDOM(options.html || DEFAULT_HTML, {
    runScripts: "outside-only",
    url: options.url || "https://fkst.local/",
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
      },
    });
  }
  if (options.getItemThrows) {
    Object.defineProperty(window.Storage.prototype, "getItem", {
      configurable: true,
      value() {
        throw new Error("getItem unavailable");
      },
    });
  }
  if (options.setItemThrows) {
    Object.defineProperty(window.Storage.prototype, "setItem", {
      configurable: true,
      value() {
        throw new Error("setItem unavailable");
      },
    });
  }
  if (options.removeItemThrows) {
    Object.defineProperty(window.Storage.prototype, "removeItem", {
      configurable: true,
      value() {
        throw new Error("removeItem unavailable");
      },
    });
  }

  try {
    window.eval(SCRIPT_SOURCE);
  } catch (error) {
    errors.push(error);
  }

  return { errors, window };
}

function assertNoClientErrors(errors) {
  assert.deepEqual(errors, []);
}

test("locale registry exposes the internal scaffold contract", () => {
  const registry = require(REGISTRY_PATH);

  assert.deepEqual(registry.supportedLocales, [
    {
      code: "en",
      htmlLang: "en",
      label: "EN",
      name: "English",
    },
    {
      code: "zh",
      htmlLang: "zh-Hans",
      label: "中文",
      name: "Chinese",
    },
  ]);
  assert.equal(registry.defaultLocale, "en");
  assert.equal(registry.persistenceKey, STORAGE_KEY);
  assert.equal(registry.isSupportedLocale("en"), true);
  assert.equal(registry.isSupportedLocale("zh"), true);
  assert.equal(registry.isSupportedLocale("zh-CN"), false);
  assert.equal(registry.resolveLocale("zh"), "zh");
  assert.equal(registry.resolveLocale("invalid"), "en");
});

test("browser helper exposes locale metadata and binds rendered switcher UI", () => {
  const { errors, window } = createHarness();

  assert.deepEqual(Array.from(window.fkstLocale.supportedLocales), ["en", "zh"]);
  assert.equal(window.fkstLocale.localeDetails.en.label, "EN");
  assert.equal(window.fkstLocale.localeDetails.zh.label, "中文");
  assert.equal(window.fkstLocale.defaultLocale, "en");
  assert.equal(window.fkstLocale.persistenceKey, STORAGE_KEY);
  assert.equal(window.document.querySelectorAll("[data-locale-switcher]").length, 1);
  assertNoClientErrors(errors);
});

test("missing or invalid stored locale falls back to default", () => {
  const missing = createHarness();
  assert.equal(missing.window.fkstLocale.readStoredLocale(), null);
  assert.equal(missing.window.fkstLocale.readLocale(), "en");
  assertNoClientErrors(missing.errors);

  const invalid = createHarness({ localStorageValue: "zh-CN" });
  assert.equal(invalid.window.fkstLocale.readStoredLocale(), null);
  assert.equal(invalid.window.fkstLocale.readLocale(), "en");
  assertNoClientErrors(invalid.errors);
});

test("valid stored locale is returned through guarded storage", () => {
  const { errors, window } = createHarness({
    html: CHINESE_HTML,
    localStorageValue: "zh",
    url: "https://fkst.local/zh/",
  });

  assert.equal(window.fkstLocale.readStoredLocale(), "zh");
  assert.equal(window.fkstLocale.readLocale(), "zh");
  assertNoClientErrors(errors);
});

test("persistLocale stores only supported locale values", () => {
  const { errors, window } = createHarness();

  assert.equal(window.fkstLocale.persistLocale("zh"), "zh");
  assert.equal(window.localStorage.getItem(STORAGE_KEY), "zh");
  assert.equal(window.fkstLocale.persistLocale("invalid"), "en");
  assert.equal(window.localStorage.getItem(STORAGE_KEY), "en");
  assertNoClientErrors(errors);
});

test("clicking a language option persists the target locale before navigation", () => {
  const { errors, window } = createHarness();

  const zh = window.document.querySelector('[data-locale-code="zh"]');
  zh.addEventListener("click", (event) => event.preventDefault());
  zh.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

  assert.equal(window.localStorage.getItem(STORAGE_KEY), "zh");
  assertNoClientErrors(errors);
});

test("stored locale redirects to a direct alternate only when it differs from the current page", () => {
  const english = createHarness();
  const redirects = [];
  english.window.localStorage.setItem(STORAGE_KEY, "zh");

  assert.equal(english.window.fkstLocale.redirectToStoredLocale((href) => redirects.push(href)), "https://fkst.local/zh/");
  assert.deepEqual(redirects, ["https://fkst.local/zh/"]);
  assertNoClientErrors(english.errors);

  const chinese = createHarness({
    html: CHINESE_HTML,
    localStorageValue: "zh",
    url: "https://fkst.local/zh/",
  });
  const sameLocaleRedirects = [];

  assert.equal(chinese.window.fkstLocale.redirectToStoredLocale((href) => sameLocaleRedirects.push(href)), null);
  assert.deepEqual(sameLocaleRedirects, []);
  assertNoClientErrors(chinese.errors);
});

test("stored locale redirect skips invalid storage, same-page alternates, and missing alternates", () => {
  const invalid = createHarness({ localStorageValue: "zh-CN" });
  const invalidRedirects = [];
  assert.equal(invalid.window.fkstLocale.redirectToStoredLocale((href) => invalidRedirects.push(href)), null);
  assert.deepEqual(invalidRedirects, []);
  assertNoClientErrors(invalid.errors);

  const samePage = createHarness({ localStorageValue: "zh", url: "https://fkst.local/zh/" });
  const samePageRedirects = [];
  assert.equal(samePage.window.fkstLocale.redirectToStoredLocale((href) => samePageRedirects.push(href)), null);
  assert.deepEqual(samePageRedirects, []);
  assertNoClientErrors(samePage.errors);

  const missingAlternate = createHarness({
    html: [
      "<!doctype html><html><body>",
      '<nav data-locale-switcher data-locale-current="en">',
      '<a href="/" data-locale-option data-locale-code="en" aria-current="page">EN</a>',
      "</nav>",
      "</body></html>",
    ].join(""),
    localStorageValue: "zh",
  });
  const missingRedirects = [];
  assert.equal(missingAlternate.window.fkstLocale.redirectToStoredLocale((href) => missingRedirects.push(href)), null);
  assert.deepEqual(missingRedirects, []);
  assertNoClientErrors(missingAlternate.errors);
});

test("storage failures do not break locale reads or writes", () => {
  const readFailure = createHarness({ getItemThrows: true });
  assert.equal(readFailure.window.fkstLocale.readStoredLocale(), null);
  assert.equal(readFailure.window.fkstLocale.readLocale(), "en");
  assertNoClientErrors(readFailure.errors);

  const writeFailure = createHarness({ setItemThrows: true });
  assert.equal(writeFailure.window.fkstLocale.persistLocale("zh"), "zh");
  assertNoClientErrors(writeFailure.errors);

  const unavailable = createHarness({ localStorageThrows: true });
  assert.equal(unavailable.window.fkstLocale.readLocale(), "en");
  assert.equal(unavailable.window.fkstLocale.persistLocale("zh"), "zh");
  assert.equal(unavailable.window.fkstLocale.redirectToStoredLocale(() => {
    throw new Error("redirect should not run");
  }), null);
  assertNoClientErrors(unavailable.errors);
});

test("clearStoredLocale removes the persisted locale when storage is available", () => {
  const { errors, window } = createHarness({
    html: CHINESE_HTML,
    localStorageValue: "zh",
    url: "https://fkst.local/zh/",
  });

  assert.equal(window.fkstLocale.clearStoredLocale(), "en");
  assert.equal(window.localStorage.getItem(STORAGE_KEY), null);
  assertNoClientErrors(errors);

  const removeFailure = createHarness({
    html: CHINESE_HTML,
    localStorageValue: "zh",
    removeItemThrows: true,
    url: "https://fkst.local/zh/",
  });
  assert.equal(removeFailure.window.fkstLocale.clearStoredLocale(), "en");
  assertNoClientErrors(removeFailure.errors);
});
