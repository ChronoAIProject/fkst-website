(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  var BUTTON_SELECTOR = "[data-back-to-top]";
  var SCROLL_THRESHOLD = 300;

  function getScrollY(targetWindow, targetDocument) {
    var root = targetDocument.documentElement;
    return targetWindow.scrollY || targetWindow.pageYOffset || (root && root.scrollTop) || 0;
  }

  function createBackToTopController(button, targetWindow, targetDocument) {
    var disposed = false;
    var removalObserver = null;

    function updateVisibility() {
      if (disposed) {
        return;
      }
      button.hidden = getScrollY(targetWindow, targetDocument) <= SCROLL_THRESHOLD;
    }

    function scrollBackToTop() {
      targetWindow.scrollTo({ top: 0, behavior: "smooth" });
    }

    function destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      targetWindow.removeEventListener("scroll", updateVisibility);
      button.removeEventListener("click", scrollBackToTop);
      if (removalObserver) {
        removalObserver.disconnect();
      }
      button._fkstBackToTopController = null;
    }

    button.addEventListener("click", scrollBackToTop);
    targetWindow.addEventListener("scroll", updateVisibility, { passive: true });

    if (targetWindow.MutationObserver && targetDocument.documentElement) {
      removalObserver = new targetWindow.MutationObserver(function () {
        if (!targetDocument.documentElement.contains(button)) {
          destroy();
        }
      });
      removalObserver.observe(targetDocument.documentElement, { childList: true, subtree: true });
    }

    updateVisibility();
    return {
      destroy: destroy,
      updateVisibility: updateVisibility
    };
  }

  function init(targetDocument, targetWindow) {
    var doc = targetDocument || document;
    var win = targetWindow || window;
    var button = doc.querySelector(BUTTON_SELECTOR);

    if (!button) {
      return null;
    }
    if (button._fkstBackToTopController) {
      return button._fkstBackToTopController;
    }

    button._fkstBackToTopController = createBackToTopController(button, win, doc);
    return button._fkstBackToTopController;
  }

  window.fkstBackToTopButton = {
    createBackToTopController: createBackToTopController,
    init: init,
    threshold: SCROLL_THRESHOLD
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
    }, { once: true });
  } else {
    init();
  }
}());
