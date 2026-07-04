#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const ROOT = path.resolve(__dirname, "..");
const SITE_ROOT = path.join(ROOT, "site");
const SCRIPT_OUTPUT_PATH = path.join(SITE_ROOT, "_site", "assets", "js", "article-scroll-progress.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_OUTPUT_PATH, "utf8");
const siteRequire = createRequire(path.join(SITE_ROOT, "package.json"));
const { JSDOM } = siteRequire("jsdom");

function progressMarkup(initialValue = "7") {
  return `<div
    class="article-scroll-progress"
    role="progressbar"
    data-article-scroll-progress
    data-article-scroll-progress-value="${initialValue}"
    aria-valuenow="${initialValue}"
    style="--article-scroll-progress: ${initialValue}%"
  ><div class="article-scroll-progress-bar" aria-hidden="true"></div></div>`;
}

function defineMetric(target, name, getter) {
  Object.defineProperty(target, name, {
    configurable: true,
    get: getter
  });
}

function createHarness(options = {}) {
  const progressCount = options.progressCount ?? 1;
  const includeContent = options.includeContent !== false;
  const includeContentHook = options.includeContentHook !== false;
  const includePageContentClass = options.includePageContentClass !== false;
  const progress = Array.from({ length: progressCount }, () => progressMarkup(options.initialValue)).join("");
  const contentClass = includePageContentClass ? "page-content" : "article-body";
  const contentHook = includeContentHook ? " data-article-scroll-content" : "";
  const content = includeContent
    ? `<div class="${contentClass}"${contentHook}>Readable content</div>`
    : "";
  const dom = new JSDOM(`<!doctype html><html><body>${progress}${content}</body></html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://fkst.local/article.html"
  });
  const { document, window } = dom.window;
  const listeners = [];
  const rafCallbacks = [];
  const timeoutCallbacks = [];
  let scrollY = options.scrollY ?? 0;
  let viewportHeight = options.viewportHeight ?? 1000;
  let scrollHeight = options.scrollHeight ?? 3000;
  let contentTop = options.contentTop ?? 500;
  let contentBottom = options.contentBottom ?? 2600;

  defineMetric(window, "scrollY", () => scrollY);
  defineMetric(window, "pageYOffset", () => 0);
  defineMetric(window, "innerHeight", () => viewportHeight);
  defineMetric(document.documentElement, "clientHeight", () => viewportHeight);
  defineMetric(document.documentElement, "scrollHeight", () => scrollHeight);
  defineMetric(document.documentElement, "offsetHeight", () => scrollHeight);
  defineMetric(document.documentElement, "scrollTop", () => 0);
  defineMetric(document.body, "scrollHeight", () => scrollHeight);
  defineMetric(document.body, "offsetHeight", () => scrollHeight);
  defineMetric(document.body, "scrollTop", () => 0);

  const contentElement = document.querySelector("[data-article-scroll-content]")
    || document.querySelector(".page-content");
  if (contentElement) {
    contentElement.getBoundingClientRect = () => ({
      top: contentTop - scrollY,
      bottom: contentBottom - scrollY
    });
  }

  if (options.scheduler === "timeout") {
    window.requestAnimationFrame = undefined;
  } else {
    window.requestAnimationFrame = (callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    };
  }
  window.setTimeout = (callback, delay) => {
    timeoutCallbacks.push({ callback, delay });
    return timeoutCallbacks.length;
  };

  const addEventListener = window.addEventListener.bind(window);
  window.addEventListener = (name, callback, listenerOptions) => {
    listeners.push({ name, callback, options: listenerOptions });
    return addEventListener(name, callback, listenerOptions);
  };

  window.eval(SCRIPT_SOURCE);

  return {
    document,
    window,
    listeners,
    rafCallbacks,
    timeoutCallbacks,
    progressElements: Array.from(document.querySelectorAll("[data-article-scroll-progress]")),
    dispatch(name) {
      window.dispatchEvent(new window.Event(name));
    },
    flushRaf() {
      const callbacks = rafCallbacks.splice(0);
      for (const callback of callbacks) {
        callback(0);
      }
    },
    flushTimeouts() {
      const callbacks = timeoutCallbacks.splice(0);
      for (const { callback } of callbacks) {
        callback();
      }
    },
    setContentRange(top, bottom) {
      contentTop = top;
      contentBottom = bottom;
    },
    setScroll(value) {
      scrollY = value;
    },
    setScrollHeight(value) {
      scrollHeight = value;
    },
    setViewportHeight(value) {
      viewportHeight = value;
    }
  };
}

function assertProgress(harness, expected) {
  for (const element of harness.progressElements) {
    const dataValue = element.getAttribute("data-article-scroll-progress-value");
    const ariaValue = element.getAttribute("aria-valuenow");
    const cssValue = element.style.getPropertyValue("--article-scroll-progress");
    assert.equal(dataValue, expected);
    assert.equal(ariaValue, expected);
    assert.equal(cssValue, `${expected}%`);
    assert.equal(Number.isFinite(Number(dataValue)), true);
  }
}

function listenersFor(harness, name) {
  return harness.listeners.filter((listener) => listener.name === name);
}

function testInitialLoadWritesZeroWithRequestAnimationFrame() {
  const harness = createHarness();

  assert.equal(harness.rafCallbacks.length, 1);
  assert.equal(harness.timeoutCallbacks.length, 0);
  assertProgress(harness, "7");
  harness.flushRaf();

  assertProgress(harness, "0");
  assert.equal(listenersFor(harness, "scroll").length, 1);
  assert.equal(listenersFor(harness, "scroll")[0].options.passive, true);
  assert.equal(listenersFor(harness, "resize").length, 1);
  assert.equal(listenersFor(harness, "pageshow").length, 1);
}

function testScrollEventsRoundAndClampReadableRange() {
  const harness = createHarness();
  harness.flushRaf();

  harness.setScroll(1056);
  harness.dispatch("scroll");
  harness.flushRaf();
  assertProgress(harness, "51");

  harness.setScroll(2500);
  harness.dispatch("scroll");
  harness.flushRaf();
  assertProgress(harness, "100");

  harness.setScroll(-200);
  harness.dispatch("scroll");
  harness.flushRaf();
  assertProgress(harness, "0");
}

function testShortDocumentWritesFiniteHundred() {
  const harness = createHarness({
    contentBottom: 600,
    contentTop: 0,
    scrollHeight: 600,
    viewportHeight: 1000
  });

  harness.flushRaf();

  assertProgress(harness, "100");
  assert.notEqual(harness.progressElements[0].getAttribute("data-article-scroll-progress-value"), "NaN");
  assert.notEqual(harness.progressElements[0].style.getPropertyValue("--article-scroll-progress"), "NaN%");
}

function testMissingProgressElementExitsWithoutListeners() {
  const harness = createHarness({
    progressCount: 0
  });

  assert.deepEqual(harness.progressElements, []);
  assert.deepEqual(harness.listeners, []);
  assert.equal(harness.rafCallbacks.length, 0);
  assert.equal(harness.timeoutCallbacks.length, 0);
}

function testMissingContentHookFallsBackToDocumentRange() {
  const harness = createHarness({
    includeContentHook: false,
    scrollY: 500
  });

  harness.flushRaf();

  assertProgress(harness, "25");
}

function testResizeAndPageshowRecomputeRestoredScrollPosition() {
  const harness = createHarness({
    scrollY: 1056
  });
  harness.flushRaf();
  assertProgress(harness, "51");

  harness.setViewportHeight(1500);
  harness.dispatch("resize");
  harness.flushRaf();
  assertProgress(harness, "93");

  harness.setScroll(1100);
  harness.dispatch("pageshow");
  harness.flushRaf();
  assertProgress(harness, "100");
}

function testSetTimeoutFallbackSchedulesWrite() {
  const harness = createHarness({
    scheduler: "timeout"
  });

  assert.equal(harness.rafCallbacks.length, 0);
  assert.equal(harness.timeoutCallbacks.length, 1);
  assert.equal(harness.timeoutCallbacks[0].delay, 16);
  assertProgress(harness, "7");

  harness.flushTimeouts();

  assertProgress(harness, "0");
}

function testMultipleProgressElementsStaySynchronized() {
  const harness = createHarness({
    progressCount: 3,
    scrollY: 1056
  });

  harness.flushRaf();

  assert.equal(harness.progressElements.length, 3);
  assertProgress(harness, "51");
}

function main() {
  const tests = [
    testInitialLoadWritesZeroWithRequestAnimationFrame,
    testScrollEventsRoundAndClampReadableRange,
    testShortDocumentWritesFiniteHundred,
    testMissingProgressElementExitsWithoutListeners,
    testMissingContentHookFallsBackToDocumentRange,
    testResizeAndPageshowRecomputeRestoredScrollPosition,
    testSetTimeoutFallbackSchedulesWrite,
    testMultipleProgressElementsStaySynchronized
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok ARTICLE_SCROLL_PROGRESS_BEHAVIOR tests=${tests.length}`);
}

main();
