#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { createPrintBrowserHarness } = require("./browser_behavior_harness");

const ROOT = path.resolve(__dirname, "..");
const HOME_OUTPUT = path.join(ROOT, "site", "_site", "index.html");

function extractPrintScript(html) {
  const matches = [
    ...html.matchAll(/<script\b(?=[^>]*\bdata-print-page-script\b)[^>]*>([\s\S]*?)<\/script>/g),
  ];
  assert.equal(matches.length, 1, "expected exactly one rendered print activation script");
  return matches[0][1];
}

function runPrintScript(script, harness) {
  const context = vm.createContext({
    HTMLButtonElement: harness.HTMLButtonElement,
    document: harness.document,
    window: harness.window,
  });
  vm.runInContext(script, context, {
    filename: "PrintPageButton.njk:inline-script",
  });
}

function activatedHarness(script, options = {}) {
  const harness = createPrintBrowserHarness(options);
  runPrintScript(script, harness);
  return harness;
}

function assertProgressiveEnhancement(script) {
  const harness = createPrintBrowserHarness({
    printAvailable: true,
    mediaMode: "event",
  });

  assert.equal(harness.button.disabled, true, "button should start disabled before activation");
  runPrintScript(script, harness);
  assert.equal(harness.button.disabled, false, "button should enable when window.print is available");
  assert.equal(
    typeof harness.window.fkstPrintPage.openPrintView,
    "function",
    "window.fkstPrintPage.openPrintView should be exposed after activation"
  );
  assert.equal(harness.window.eventListenerCount("beforeprint"), 1);
  assert.equal(harness.window.eventListenerCount("afterprint"), 1);
}

function assertUnavailablePrint(script) {
  const harness = createPrintBrowserHarness({
    printAvailable: false,
    mediaMode: "event",
  });

  assert.doesNotThrow(() => runPrintScript(script, harness));
  assert.equal(harness.button.disabled, true, "button should stay disabled without window.print");
  assert.equal(harness.window.fkstPrintPage, undefined);
  assert.equal(harness.window.eventListenerCount("beforeprint"), 0);
  assert.equal(harness.window.eventListenerCount("afterprint"), 0);
}

function assertClickPrintFlow(script) {
  const harness = activatedHarness(script, {
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

function assertPrintEvents(script) {
  const harness = activatedHarness(script, {
    printAvailable: true,
    mediaMode: "event",
  });

  harness.window.dispatchEvent({ type: "beforeprint" });
  assert.equal(harness.root.getAttribute("data-printing"), "true");

  harness.window.dispatchEvent({ type: "afterprint" });
  assert.equal(harness.root.hasAttribute("data-printing"), false);
}

function assertPrintMediaSync(script, mediaMode) {
  const harness = activatedHarness(script, {
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
  const script = extractPrintScript(html);

  assertProgressiveEnhancement(script);
  assertUnavailablePrint(script);
  assertClickPrintFlow(script);
  assertPrintEvents(script);
  assertPrintMediaSync(script, "event");
  assertPrintMediaSync(script, "legacy");

  console.log("fkst-website dept=site tag=ok PRINT_PAGE_BUTTON_BEHAVIOR cases=6");
}

main();
