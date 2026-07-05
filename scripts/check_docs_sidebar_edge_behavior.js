#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const ROOT = path.resolve(__dirname, "..");
const SITE_ROOT = path.join(ROOT, "site");
const SIDEBAR_SCRIPT_PATH = path.join(SITE_ROOT, "src", "assets", "js", "docs-sidebar.js");
const SIDEBAR_SCRIPT_SOURCE = fs.readFileSync(SIDEBAR_SCRIPT_PATH, "utf8");
const siteRequire = createRequire(path.join(SITE_ROOT, "package.json"));
const { JSDOM } = siteRequire("jsdom");

function createMarkup(navigation, content) {
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

function tocEntry(href, label, level = 2) {
  return `<li data-docs-toc-entry data-docs-toc-level="${level}" data-docs-toc-depth="${level}">
    <a href="${href}" data-docs-toc-link>${label}</a>
  </li>`;
}

function createHarness(options = {}) {
  const errors = [];
  const rafCallbacks = [];
  const html = options.html || createMarkup(options.navigation, options.content);
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: options.url || "https://fkst.local/docs.html"
  });
  const { document, window } = dom.window;

  window.addEventListener("error", (event) => {
    errors.push(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    errors.push(event.reason);
  });
  window.requestAnimationFrame = (callback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  };

  try {
    window.eval(SIDEBAR_SCRIPT_SOURCE);
  } catch (error) {
    errors.push(error);
  }

  return {
    document,
    dom,
    errors,
    rafCallbacks,
    sidebarList: document.querySelector("[data-docs-sidebar-list]"),
    window,
    dispatch(name) {
      window.dispatchEvent(new window.Event(name));
    }
  };
}

function sidebarLinks(harness) {
  return Array.from(harness.sidebarList.querySelectorAll("[data-docs-toc-link]"));
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

function setHash(harness, hash) {
  harness.window.location.hash = hash;
  harness.dispatch("hashchange");
}

function assertNoClientErrors(errors) {
  assert.deepEqual(errors, []);
}

function testMalformedFragmentsUseRawFallbackAndSingleActiveLink() {
  const harness = createHarness({
    navigation: [
      tocEntry("#bad%ZZ-fragment", "Malformed fragment"),
      tocEntry("#partial%E0%A4%A", "Partial fragment"),
      tocEntry("#valid-target", "Valid target"),
    ].join(""),
    content: `
      <h2 id="bad%ZZ-fragment">Malformed fragment</h2>
      <h2 id="partial%E0%A4%A">Partial fragment</h2>
      <h2 id="valid-target">Valid target</h2>
    `
  });

  setHash(harness, "#bad%ZZ-fragment");
  assertActiveSidebarHref(harness, "#bad%ZZ-fragment");

  setHash(harness, "#partial%E0%A4%A");
  assertActiveSidebarHref(harness, "#partial%E0%A4%A");

  setHash(harness, "#missing%ZZ-fragment");
  assertActiveSidebarHref(harness, null);

  setHash(harness, "#valid-target");
  assertActiveSidebarHref(harness, "#valid-target");
  assertNoClientErrors(harness.errors);
}

function testEncodedCollisionsUseOneResolvableActiveLink() {
  const harness = createHarness({
    navigation: [
      tocEntry("#encoded%20target", "Encoded target"),
      tocEntry("#encoded target", "Raw target"),
      tocEntry("#encoded%2520target", "Missing double-encoded target"),
      tocEntry("#solo-target", "Solo target"),
    ].join(""),
    content: `
      <h2 id="encoded target">Encoded target</h2>
      <h2 id="solo-target">Solo target</h2>
    `
  });
  const links = sidebarLinks(harness);

  setHash(harness, "#encoded%20target");
  assertActiveSidebarHref(harness, "#encoded%20target");

  links[1].click();
  assertActiveSidebarHref(harness, "#encoded%20target");

  links[2].click();
  assertActiveSidebarHref(harness, null);

  setHash(harness, "#solo-target");
  assertActiveSidebarHref(harness, "#solo-target");
  assertNoClientErrors(harness.errors);
}

function testMissingTargetClickClearsAndValidHashRestoresOneActiveLink() {
  const harness = createHarness({
    navigation: [
      tocEntry("#company-model", "Company model"),
      tocEntry("#delivery-model", "Reliable delivery"),
      tocEntry("#missing-target", "Missing target"),
    ].join(""),
    content: `
      <h2 id="company-model">Company model</h2>
      <h2 id="delivery-model">Reliable delivery</h2>
    `
  });
  const links = sidebarLinks(harness);

  setHash(harness, "#delivery-model");
  assertActiveSidebarHref(harness, "#delivery-model");

  links[2].click();
  assertActiveSidebarHref(harness, null);

  setHash(harness, "#company-model");
  assertActiveSidebarHref(harness, "#company-model");
  assertNoClientErrors(harness.errors);
}

function main() {
  const tests = [
    testMalformedFragmentsUseRawFallbackAndSingleActiveLink,
    testEncodedCollisionsUseOneResolvableActiveLink,
    testMissingTargetClickClearsAndValidHashRestoresOneActiveLink,
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok DOCS_SIDEBAR_EDGE_BEHAVIOR tests=${tests.length}`);
}

main();
