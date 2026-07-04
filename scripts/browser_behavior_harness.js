"use strict";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (typeof listener !== "function") {
      return;
    }

    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    const eventObject = typeof event === "string" ? { type: event } : event;
    const listeners = this.listeners.get(eventObject.type) || [];
    for (const listener of [...listeners]) {
      listener.call(this, eventObject);
    }
    return true;
  }

  eventListenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }
}

class FakeElement extends FakeEventTarget {
  constructor() {
    super();
    this.attributes = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

class FakeButtonElement extends FakeElement {
  constructor() {
    super();
    this.disabled = true;
  }

  click() {
    if (this.disabled) {
      return;
    }

    this.dispatchEvent({
      type: "click",
      target: this,
      currentTarget: this,
    });
  }
}

function createFrameQueue() {
  const frames = [];

  return {
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    runNext() {
      const callback = frames.shift();
      if (!callback) {
        throw new Error("no pending animation frame");
      }
      callback(0);
    },
    runAll() {
      while (frames.length) {
        this.runNext();
      }
    },
    pendingCount() {
      return frames.length;
    },
  };
}

function createTimerQueue() {
  let nextId = 1;
  const timers = [];

  return {
    setTimeout(callback, delay = 0) {
      const timer = {
        id: nextId,
        callback,
        delay: Number(delay) || 0,
        cleared: false,
      };
      nextId += 1;
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const timer = timers.find((item) => item.id === id);
      if (timer) {
        timer.cleared = true;
      }
    },
    runNext() {
      const index = timers.findIndex((timer) => !timer.cleared);
      if (index < 0) {
        throw new Error("no pending timeout");
      }
      const [timer] = timers.splice(index, 1);
      timer.callback();
    },
    runAll() {
      while (timers.some((timer) => !timer.cleared)) {
        this.runNext();
      }
    },
    pendingDelays() {
      return timers.filter((timer) => !timer.cleared).map((timer) => timer.delay);
    },
    pendingCount() {
      return timers.filter((timer) => !timer.cleared).length;
    },
  };
}

function createPrintMedia(mode) {
  const changeListeners = [];
  const legacyListeners = [];
  const media = {
    matches: false,
    media: "print",
    queries: [],
    dispatch(matches) {
      this.matches = matches;
      const event = {
        matches,
        media: "print",
      };

      for (const listener of [...changeListeners, ...legacyListeners]) {
        listener.call(this, event);
      }
    },
    changeListenerCount() {
      return changeListeners.length;
    },
    legacyListenerCount() {
      return legacyListeners.length;
    },
  };

  if (mode === "event") {
    media.addEventListener = (type, listener) => {
      if (type === "change" && typeof listener === "function") {
        changeListeners.push(listener);
      }
    };
  }

  if (mode === "legacy") {
    media.addListener = (listener) => {
      if (typeof listener === "function") {
        legacyListeners.push(listener);
      }
    };
  }

  return media;
}

function createPrintBrowserHarness(options = {}) {
  const {
    printAvailable = true,
    mediaMode = "event",
    requestAnimationFrameAvailable = true,
  } = options;
  const root = new FakeElement();
  const button = new FakeButtonElement();
  const window = new FakeEventTarget();
  const frames = createFrameQueue();
  const timers = createTimerQueue();
  const printCalls = [];
  const document = {
    documentElement: root,
    querySelector(selector) {
      if (selector === "[data-print-page-button]") {
        return button;
      }
      return null;
    },
  };

  window.window = window;
  window.document = document;
  window.setTimeout = timers.setTimeout;
  window.clearTimeout = timers.clearTimeout;

  if (requestAnimationFrameAvailable) {
    window.requestAnimationFrame = frames.requestAnimationFrame;
  }

  if (printAvailable) {
    window.print = () => {
      printCalls.push({
        rootPrinting: root.getAttribute("data-printing"),
      });
    };
  }

  let media = null;
  if (mediaMode) {
    media = createPrintMedia(mediaMode);
    window.matchMedia = (query) => {
      media.queries.push(query);
      return media;
    };
  }

  return {
    HTMLButtonElement: FakeButtonElement,
    button,
    document,
    frames,
    media,
    printCalls,
    root,
    timers,
    window,
  };
}

module.exports = {
  createPrintBrowserHarness,
};
