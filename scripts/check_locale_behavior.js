#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SITE_ROOT = path.join(ROOT, "site");
const SITE_OUTPUT = path.join(SITE_ROOT, "_site");
const SCRIPT_OUTPUT = path.join(SITE_OUTPUT, "assets", "js", "locale.js");
const STYLE_OUTPUT = path.join(SITE_OUTPUT, "assets", "css", "style.css");
const SITE_ORIGIN = "https://chronoaiproject.github.io";
const STORAGE_KEY = "fkst-locale";
const siteRequire = createRequire(path.join(SITE_ROOT, "package.json"));
const { JSDOM } = siteRequire("jsdom");

const LOCALE_DETAILS = Object.freeze({
  en: Object.freeze({
    htmlLang: "en",
    label: "EN",
    name: "English",
  }),
  zh: Object.freeze({
    htmlLang: "zh-Hans",
    label: "中文",
    name: "Chinese",
  }),
});

const EXPECTED_PAGES = Object.freeze([
  Object.freeze({
    route: "/",
    htmlLang: "en",
    current: "en",
    hrefs: Object.freeze({
      en: "/fkst-website/",
      zh: "/fkst-website/zh/",
    }),
  }),
  Object.freeze({
    route: "/zh/",
    htmlLang: "zh-Hans",
    current: "zh",
    hrefs: Object.freeze({
      en: "/fkst-website/",
      zh: "/fkst-website/zh/",
    }),
  }),
  Object.freeze({
    route: "/architecture.html",
    htmlLang: "en",
    current: "en",
    hrefs: Object.freeze({
      en: "/fkst-website/architecture.html",
      zh: "/fkst-website/zh/architecture.html",
    }),
  }),
  Object.freeze({
    route: "/zh/architecture.html",
    htmlLang: "zh-Hans",
    current: "zh",
    hrefs: Object.freeze({
      en: "/fkst-website/architecture.html",
      zh: "/fkst-website/zh/architecture.html",
    }),
  }),
  Object.freeze({
    route: "/doctrine.html",
    htmlLang: "en",
    current: "en",
    hrefs: Object.freeze({
      en: "/fkst-website/doctrine.html",
      zh: "/fkst-website/zh/doctrine.html",
    }),
  }),
  Object.freeze({
    route: "/zh/doctrine.html",
    htmlLang: "zh-Hans",
    current: "zh",
    hrefs: Object.freeze({
      en: "/fkst-website/doctrine.html",
      zh: "/fkst-website/zh/doctrine.html",
    }),
  }),
]);

function outputPath(route) {
  const cleanRoute = route.replace(/^\/+/, "");
  if (route.endsWith("/")) {
    return path.join(SITE_OUTPUT, cleanRoute, "index.html");
  }
  return path.join(SITE_OUTPUT, cleanRoute);
}

function routeUrl(route) {
  const cleanRoute = route.replace(/^\/+/, "");
  const prefixedPath = cleanRoute ? `/fkst-website/${cleanRoute}` : "/fkst-website/";
  return new URL(prefixedPath, SITE_ORIGIN).href;
}

function absoluteHref(href) {
  return new URL(href, SITE_ORIGIN).href;
}

function readBuiltPage(route) {
  const pagePath = outputPath(route);
  assert.equal(fs.existsSync(pagePath), true, `${route}: missing built page ${pagePath}`);
  return fs.readFileSync(pagePath, "utf8");
}

function pageDom(page) {
  return new JSDOM(readBuiltPage(page.route), {
    url: routeUrl(page.route),
  });
}

function optionCodes(options) {
  return options.map((option) => option.getAttribute("data-locale-code"));
}

function assertNoExternalMarkerNoise(option, route, code) {
  assert.equal(
    option.hasAttribute("data-external-link"),
    false,
    `${route}: ${code}: locale option must not be marked as external`
  );
  assert.equal(
    option.classList.contains("external-link"),
    false,
    `${route}: ${code}: locale option must not receive external-link class`
  );
  assert.equal(
    option.querySelectorAll(".external-link-marker").length,
    0,
    `${route}: ${code}: locale option must not render an external-link marker`
  );
}

function assertSwitcherMarkup(page) {
  const dom = pageDom(page);
  const { document } = dom.window;
  assert.equal(
    document.documentElement.getAttribute("lang"),
    page.htmlLang,
    `${page.route}: html lang mismatch`
  );

  const header = document.querySelector("header.site-header");
  assert.ok(header, `${page.route}: missing site header`);
  const headerActions = header.querySelector(".header-actions");
  assert.ok(headerActions, `${page.route}: missing header actions`);

  const allSwitchers = document.querySelectorAll("[data-locale-switcher]");
  assert.equal(allSwitchers.length, 1, `${page.route}: expected exactly one locale switcher`);
  assert.equal(
    headerActions.querySelectorAll("[data-locale-switcher]").length,
    1,
    `${page.route}: locale switcher must render in header actions`
  );

  const switcher = allSwitchers[0];
  assert.equal(
    switcher.classList.contains("locale-switcher"),
    true,
    `${page.route}: switcher missing locale-switcher class`
  );
  assert.equal(switcher.getAttribute("aria-label"), "Language", `${page.route}: switcher label mismatch`);
  assert.equal(
    switcher.getAttribute("data-locale-current"),
    page.current,
    `${page.route}: data-locale-current mismatch`
  );

  const options = Array.from(switcher.querySelectorAll("[data-locale-option]"));
  assert.deepEqual(optionCodes(options), ["en", "zh"], `${page.route}: locale option order mismatch`);
  assert.equal(
    options.filter((option) => option.getAttribute("aria-current") === "page").length,
    1,
    `${page.route}: expected exactly one aria-current page option`
  );
  assert.equal(
    options.filter((option) => option.classList.contains("is-current")).length,
    1,
    `${page.route}: expected exactly one styled current option`
  );

  for (const option of options) {
    const code = option.getAttribute("data-locale-code");
    const locale = LOCALE_DETAILS[code];
    assert.ok(locale, `${page.route}: unsupported option code ${code}`);

    assert.equal(option.tagName, "A", `${page.route}: ${code}: locale option must be a link`);
    assert.equal(option.textContent.trim(), locale.label, `${page.route}: ${code}: label mismatch`);
    assert.equal(option.getAttribute("href"), page.hrefs[code], `${page.route}: ${code}: href mismatch`);
    assert.equal(option.href, absoluteHref(page.hrefs[code]), `${page.route}: ${code}: absolute href mismatch`);
    assert.equal(
      option.getAttribute("hreflang"),
      locale.htmlLang,
      `${page.route}: ${code}: hreflang mismatch`
    );
    assert.equal(option.getAttribute("lang"), locale.htmlLang, `${page.route}: ${code}: lang mismatch`);
    assert.equal(
      option.classList.contains("locale-switcher-option"),
      true,
      `${page.route}: ${code}: missing locale-switcher-option class`
    );
    assertNoExternalMarkerNoise(option, page.route, code);

    if (code === page.current) {
      assert.equal(option.getAttribute("aria-current"), "page", `${page.route}: ${code}: current state missing`);
      assert.equal(
        option.classList.contains("is-current"),
        true,
        `${page.route}: ${code}: current styling missing`
      );
      assert.equal(
        option.getAttribute("aria-label"),
        `${locale.name}, current language`,
        `${page.route}: ${code}: current aria-label mismatch`
      );
    } else {
      assert.equal(
        option.hasAttribute("aria-current"),
        false,
        `${page.route}: ${code}: alternate must not expose current state`
      );
      assert.equal(
        option.classList.contains("is-current"),
        false,
        `${page.route}: ${code}: alternate must not have current styling`
      );
      assert.equal(
        option.getAttribute("aria-label"),
        locale.name,
        `${page.route}: ${code}: alternate aria-label mismatch`
      );
      assert.ok(option.getAttribute("href"), `${page.route}: ${code}: alternate must keep a no-JS href`);
    }
  }
}

function assertBuiltMarkupContracts() {
  for (const page of EXPECTED_PAGES) {
    assertSwitcherMarkup(page);
  }
}

function installStorageFaults(window, options) {
  if (options.localStorageThrows) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("localStorage unavailable");
      },
    });
  }

  const throwingMethods = [
    ["getItemThrows", "getItem"],
    ["setItemThrows", "setItem"],
    ["removeItemThrows", "removeItem"],
  ];
  for (const [optionName, methodName] of throwingMethods) {
    if (options[optionName]) {
      Object.defineProperty(window.Storage.prototype, methodName, {
        configurable: true,
        value() {
          throw new Error(`${methodName} unavailable`);
        },
      });
    }
  }
}

function createClientHarness(html, url, options = {}) {
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url,
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
  installStorageFaults(window, options);

  try {
    window.eval(fs.readFileSync(SCRIPT_OUTPUT, "utf8"));
  } catch (error) {
    errors.push(error);
  }

  return {
    document: window.document,
    errors,
    window,
  };
}

function assertNoClientErrors(errors, context) {
  assert.deepEqual(errors, [], `${context}: client script should not report errors`);
}

function builtHarnessFor(page, options = {}) {
  return createClientHarness(readBuiltPage(page.route), routeUrl(page.route), options);
}

function assertNoRedirect(harness, context) {
  const redirects = [];
  const result = harness.window.fkstLocale.redirectToStoredLocale((href) => {
    redirects.push(href);
    throw new Error(`${context}: unexpected navigation to ${href}`);
  });
  assert.equal(result, null, `${context}: redirect result mismatch`);
  assert.deepEqual(redirects, [], `${context}: redirects mismatch`);
  assertNoClientErrors(harness.errors, context);
}

function assertClickPersistsBeforeNavigation() {
  for (const page of EXPECTED_PAGES) {
    const targetLocale = page.current === "en" ? "zh" : "en";
    const harness = builtHarnessFor(page);
    const option = harness.document.querySelector(`[data-locale-code="${targetLocale}"]`);
    assert.ok(option, `${page.route}: missing alternate locale option`);

    const nestedTarget = harness.document.createElement("span");
    nestedTarget.textContent = option.textContent;
    option.textContent = "";
    option.append(nestedTarget);

    const storageAtNavigationBoundary = [];
    harness.document.addEventListener("click", (event) => {
      storageAtNavigationBoundary.push(harness.window.localStorage.getItem(STORAGE_KEY));
      event.preventDefault();
    });

    nestedTarget.dispatchEvent(
      new harness.window.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      })
    );

    assert.deepEqual(
      storageAtNavigationBoundary,
      [targetLocale],
      `${page.route}: locale must be persisted before document-level navigation handling`
    );
    assert.equal(
      harness.window.localStorage.getItem(STORAGE_KEY),
      targetLocale,
      `${page.route}: click target inside option should persist target locale`
    );
    assertNoClientErrors(harness.errors, page.route);
  }
}

function assertStoredLocaleRedirects() {
  for (const page of EXPECTED_PAGES) {
    for (const targetLocale of ["en", "zh"]) {
      const harness = builtHarnessFor(page);
      harness.window.localStorage.setItem(STORAGE_KEY, targetLocale);

      if (targetLocale === page.current) {
        assertNoRedirect(harness, `${page.route}: same-locale stored ${targetLocale}`);
        continue;
      }

      const redirects = [];
      const expectedHref = absoluteHref(page.hrefs[targetLocale]);
      const result = harness.window.fkstLocale.redirectToStoredLocale((href) => redirects.push(href));
      assert.equal(result, expectedHref, `${page.route}: redirect result mismatch`);
      assert.deepEqual(redirects, [expectedHref], `${page.route}: redirects mismatch`);
      assertNoClientErrors(harness.errors, page.route);
    }
  }
}

function assertRedirectGuards() {
  const page = EXPECTED_PAGES[0];

  const invalidStored = builtHarnessFor(page);
  invalidStored.window.localStorage.setItem(STORAGE_KEY, "zh-CN");
  assertNoRedirect(invalidStored, "invalid stored locale");

  const missingSwitcher = createClientHarness(
    "<!doctype html><html><body><main>No switcher</main></body></html>",
    routeUrl("/")
  );
  missingSwitcher.window.localStorage.setItem(STORAGE_KEY, "zh");
  assertNoRedirect(missingSwitcher, "missing switcher");

  const missingAlternate = createClientHarness(
    [
      "<!doctype html><html><body>",
      '<nav data-locale-switcher data-locale-current="en">',
      '<a href="/fkst-website/" data-locale-option data-locale-code="en" aria-current="page">EN</a>',
      "</nav>",
      "</body></html>",
    ].join(""),
    routeUrl("/")
  );
  missingAlternate.window.localStorage.setItem(STORAGE_KEY, "zh");
  assertNoRedirect(missingAlternate, "missing alternate");

  const samePageAlternate = createClientHarness(
    [
      "<!doctype html><html><body>",
      '<nav data-locale-switcher data-locale-current="en">',
      '<a href="/fkst-website/" data-locale-option data-locale-code="en" aria-current="page">EN</a>',
      '<a href="/fkst-website/" data-locale-option data-locale-code="zh">中文</a>',
      "</nav>",
      "</body></html>",
    ].join(""),
    routeUrl("/")
  );
  samePageAlternate.window.localStorage.setItem(STORAGE_KEY, "zh");
  assertNoRedirect(samePageAlternate, "same-page alternate");

  const unavailableStorage = builtHarnessFor(page, { localStorageThrows: true });
  assert.equal(unavailableStorage.window.fkstLocale.readStoredLocale(), null);
  assert.equal(unavailableStorage.window.fkstLocale.readLocale(), "en");
  assert.equal(unavailableStorage.window.fkstLocale.persistLocale("zh"), "zh");
  assertNoRedirect(unavailableStorage, "unavailable storage");

  const readFailure = builtHarnessFor(page, { getItemThrows: true });
  assert.equal(readFailure.window.fkstLocale.readStoredLocale(), null);
  assert.equal(readFailure.window.fkstLocale.readLocale(), "en");
  assertNoRedirect(readFailure, "storage read failure");

  const writeFailure = builtHarnessFor(page, { setItemThrows: true });
  assert.equal(writeFailure.window.fkstLocale.persistLocale("zh"), "zh");
  assertNoClientErrors(writeFailure.errors, "storage write failure");
}

function fixtureSource(name, fields) {
  return path.join(SITE_ROOT, "src", `__locale_behavior_${name}.njk`);
}

function fixtureOutput(name) {
  return path.join(SITE_OUTPUT, `__locale_behavior_${name}`, "index.html");
}

function writeFixture(name, frontMatter) {
  const source = fixtureSource(name);
  fs.writeFileSync(
    source,
    [
      "---",
      "layout: layouts/page.njk",
      `permalink: /__locale_behavior_${name}/`,
      "lang: en",
      "title: Locale Behavior Fixture | fkst",
      "description: Fixture for locale switcher behavior tests.",
      "brandHref: /",
      "nav: []",
      frontMatter.trim(),
      "---",
      "<p>Locale fixture.</p>",
      "",
    ].join("\n"),
    "utf8"
  );
  return source;
}

function runSiteBuild() {
  const result = spawnSync("npm", ["run", "build"], {
    cwd: SITE_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`fixture build failed with status ${result.status}`);
  }
}

function assertFixtureFailsClosed(name) {
  const output = fixtureOutput(name);
  assert.equal(fs.existsSync(output), true, `${name}: missing fixture output ${output}`);
  const dom = new JSDOM(fs.readFileSync(output, "utf8"));
  assert.equal(
    dom.window.document.querySelectorAll("[data-locale-switcher]").length,
    0,
    `${name}: invalid locale data must not render a switcher`
  );
}

function assertInvalidLocaleDataFailsClosed() {
  const fixtures = [
    [
      "missing_zh",
      [
        "localeCode: en",
        "localeAlternates:",
        "  en: /__locale_behavior_missing_zh/",
      ].join("\n"),
    ],
    [
      "unsupported_current",
      [
        "localeCode: es",
        "localeAlternates:",
        "  en: /__locale_behavior_unsupported_current/",
        "  zh: /zh/",
      ].join("\n"),
    ],
    [
      "invalid_alternate_url",
      [
        "localeCode: en",
        "localeAlternates:",
        "  en: /__locale_behavior_invalid_alternate_url/",
        "  zh: https://example.invalid/zh/",
      ].join("\n"),
    ],
  ];
  const sources = fixtures.map(([name, frontMatter]) => writeFixture(name, frontMatter));

  try {
    runSiteBuild();
    for (const [name] of fixtures) {
      assertFixtureFailsClosed(name);
    }
  } finally {
    for (const source of sources) {
      fs.rmSync(source, { force: true });
    }
  }
}

function assertPrintChromeContract() {
  const style = fs.readFileSync(STYLE_OUTPUT, "utf8").replace(/\s+/g, " ");
  assert.match(style, /@media print \{/, "stylesheet must include print media");
  assert.ok(
    style.includes(".locale-switcher,"),
    "print stylesheet must include locale-switcher in hidden chrome"
  );
  assert.ok(
    style.includes(".external-link-marker,"),
    "print stylesheet must include external-link-marker in hidden chrome"
  );
  assert.ok(
    style.includes("display: none !important;"),
    "print hidden chrome rule must be important"
  );
}

function main() {
  assert.equal(fs.existsSync(SCRIPT_OUTPUT), true, `missing built locale script ${SCRIPT_OUTPUT}`);
  assertBuiltMarkupContracts();
  assertClickPersistsBeforeNavigation();
  assertStoredLocaleRedirects();
  assertRedirectGuards();
  assertInvalidLocaleDataFailsClosed();
  assertPrintChromeContract();

  console.log("fkst-website dept=site tag=ok LOCALE_BEHAVIOR pages=6 fixtures=3");
}

main();
