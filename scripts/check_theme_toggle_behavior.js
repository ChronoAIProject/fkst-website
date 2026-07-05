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

function main() {
  const tests = [
    testBuiltPagesIncludeOneEnabledToggleAndScript,
    testStylesheetExposesExplicitThemeHooks
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok THEME_TOGGLE_BEHAVIOR tests=${tests.length}`);
}

main();
