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

function createHarness(options = {}) {
  const errors = [];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    url: "https://fkst.local/",
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

test("browser helper exposes locale metadata without rendering UI", () => {
  const { errors, window } = createHarness();

  assert.deepEqual(Array.from(window.fkstLocale.supportedLocales), ["en", "zh"]);
  assert.equal(window.fkstLocale.localeDetails.en.label, "EN");
  assert.equal(window.fkstLocale.localeDetails.zh.label, "中文");
  assert.equal(window.fkstLocale.defaultLocale, "en");
  assert.equal(window.fkstLocale.persistenceKey, STORAGE_KEY);
  assert.equal(window.document.querySelector("[data-locale-switcher]"), null);
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
  const { errors, window } = createHarness({ localStorageValue: "zh" });

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
  assertNoClientErrors(unavailable.errors);
});

test("clearStoredLocale removes the persisted locale when storage is available", () => {
  const { errors, window } = createHarness({ localStorageValue: "zh" });

  assert.equal(window.fkstLocale.clearStoredLocale(), "en");
  assert.equal(window.localStorage.getItem(STORAGE_KEY), null);
  assertNoClientErrors(errors);

  const removeFailure = createHarness({
    localStorageValue: "zh",
    removeItemThrows: true,
  });
  assert.equal(removeFailure.window.fkstLocale.clearStoredLocale(), "en");
  assertNoClientErrors(removeFailure.errors);
});
