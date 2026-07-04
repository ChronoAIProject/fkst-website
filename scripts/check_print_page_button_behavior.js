#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createPrintBrowserHarness } = require("./browser_behavior_harness");

const ROOT = path.resolve(__dirname, "..");
const HOME_OUTPUT = path.join(ROOT, "site", "_site", "index.html");
const PRINT_SCRIPT_OUTPUT = path.join(ROOT, "site", "_site", "assets", "js", "print-page-button.js");
const PRINT_SCRIPT_SOURCE = path.join(ROOT, "site", "src", "assets", "js", "print-page-button.js");
const { activatePrintPageButton } = require(PRINT_SCRIPT_SOURCE);

function assertRenderedScriptReference(html) {
  const matches = [
    ...html.matchAll(/<script\b(?=[^>]*\bdata-print-page-script\b)([^>]*)>([\s\S]*?)<\/script>/g),
  ];
  assert.equal(matches.length, 1, "expected exactly one rendered print activation script");
  const [, attrs, body] = matches[0];
  const srcMatch = attrs.match(/\bsrc="([^"]+)"/);

  assert.ok(srcMatch, "rendered print activation script should reference a script asset");
  assert.ok(
    srcMatch[1].endsWith("/assets/js/print-page-button.js"),
    `unexpected print activation script src: ${srcMatch[1]}`
  );
  assert.equal(body.trim(), "", "rendered print activation script should not contain inline code");
  assert.ok(fs.existsSync(PRINT_SCRIPT_OUTPUT), "expected built print activation script asset");
}

function runPrintScript(harness) {
  return activatePrintPageButton(harness.window);
}

function activatedHarness(options = {}) {
  const harness = createPrintBrowserHarness(options);
  runPrintScript(harness);
  return harness;
}

function assertProgressiveEnhancement() {
  const harness = createPrintBrowserHarness({
    printAvailable: true,
    mediaMode: "event",
  });

  assert.equal(harness.button.disabled, true, "button should start disabled before activation");
  assert.equal(runPrintScript(harness), true);
  assert.equal(harness.button.disabled, false, "button should enable when window.print is available");
  assert.equal(
    typeof harness.window.fkstPrintPage.openPrintView,
    "function",
    "window.fkstPrintPage.openPrintView should be exposed after activation"
  );
  assert.equal(harness.window.eventListenerCount("beforeprint"), 1);
  assert.equal(harness.window.eventListenerCount("afterprint"), 1);
}

function assertUnavailablePrint() {
  const harness = createPrintBrowserHarness({
    printAvailable: false,
    mediaMode: "event",
  });

  assert.doesNotThrow(() => runPrintScript(harness));
  assert.equal(runPrintScript(harness), false);
  assert.equal(harness.button.disabled, true, "button should stay disabled without window.print");
  assert.equal(harness.window.fkstPrintPage, undefined);
  assert.equal(harness.window.eventListenerCount("beforeprint"), 0);
  assert.equal(harness.window.eventListenerCount("afterprint"), 0);
}

function assertClickPrintFlow() {
  const harness = activatedHarness({
    printAvailable: true,
    mediaMode: "event",
  });
  const originalOpenPrintView = harness.window.fkstPrintPage.openPrintView;
  let apiCalls = 0;

  harness.window.fkstPrintPage.openPrintView = () => {
    apiCalls += 1;
    originalOpenPrintView();
  };

  harness.button.click();
  assert.equal(apiCalls, 1, "click should call window.fkstPrintPage.openPrintView()");
  assert.equal(
    harness.root.getAttribute("data-printing"),
    "true",
    "click should set data-printing before print is invoked"
  );
  assert.equal(harness.printCalls.length, 0, "print should wait for the first animation frame");
  assert.equal(harness.frames.pendingCount(), 1);

  harness.frames.runNext();
  assert.equal(harness.printCalls.length, 0, "print should wait for the second animation frame");
  assert.equal(harness.frames.pendingCount(), 1);

  harness.frames.runNext();
  assert.deepEqual(
    harness.printCalls,
    [{ rootPrinting: "true" }],
    "window.print should run once while data-printing is set"
  );
  assert.deepEqual(
    harness.timers.pendingDelays(),
    [1000],
    "print flow should schedule the existing fallback cleanup delay"
  );

  harness.timers.runAll();
  assert.equal(
    harness.root.hasAttribute("data-printing"),
    false,
    "fallback timeout should clear data-printing when no print event arrives"
  );
}

function assertPrintEvents() {
  const harness = activatedHarness({
    printAvailable: true,
    mediaMode: "event",
  });

  harness.window.dispatchEvent({ type: "beforeprint" });
  assert.equal(harness.root.getAttribute("data-printing"), "true");

  harness.window.dispatchEvent({ type: "afterprint" });
  assert.equal(harness.root.hasAttribute("data-printing"), false);
}

function assertPrintMediaSync(mediaMode) {
  const harness = activatedHarness({
    printAvailable: true,
    mediaMode,
  });

  assert.deepEqual(harness.media.queries, ["print"]);
  if (mediaMode === "event") {
    assert.equal(harness.media.changeListenerCount(), 1);
    assert.equal(harness.media.legacyListenerCount(), 0);
  } else {
    assert.equal(harness.media.changeListenerCount(), 0);
    assert.equal(harness.media.legacyListenerCount(), 1);
  }

  harness.media.dispatch(true);
  assert.equal(harness.root.getAttribute("data-printing"), "true");

  harness.media.dispatch(false);
  assert.equal(harness.root.hasAttribute("data-printing"), false);
}

function main() {
  const html = fs.readFileSync(HOME_OUTPUT, "utf8");
  assertRenderedScriptReference(html);

  assertProgressiveEnhancement();
  assertUnavailablePrint();
  assertClickPrintFlow();
  assertPrintEvents();
  assertPrintMediaSync("event");
  assertPrintMediaSync("legacy");

  console.log("fkst-website dept=site tag=ok PRINT_PAGE_BUTTON_BEHAVIOR cases=6");
}

main();
