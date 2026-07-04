(() => {
  "use strict";

  function activatePrintPageButton(browserWindow) {
    if (!browserWindow || !browserWindow.document) {
      return false;
    }

    const button = browserWindow.document.querySelector("[data-print-page-button]");
    if (
      typeof browserWindow.HTMLButtonElement !== "function" ||
      !(button instanceof browserWindow.HTMLButtonElement) ||
      typeof browserWindow.print !== "function"
    ) {
      return false;
    }

    const root = browserWindow.document.documentElement;
    const setPrintState = () => {
      root.setAttribute("data-printing", "true");
    };
    const clearPrintState = () => {
      root.removeAttribute("data-printing");
    };
    const openPrintView = () => {
      setPrintState();
      const invokePrint = () => {
        try {
          browserWindow.print();
        } finally {
          browserWindow.setTimeout(clearPrintState, 1000);
        }
      };

      if (typeof browserWindow.requestAnimationFrame === "function") {
        browserWindow.requestAnimationFrame(() => {
          browserWindow.requestAnimationFrame(invokePrint);
        });
        return;
      }

      browserWindow.setTimeout(invokePrint, 0);
    };
    const api = browserWindow.fkstPrintPage && typeof browserWindow.fkstPrintPage === "object"
      ? browserWindow.fkstPrintPage
      : {};

    api.openPrintView = openPrintView;
    browserWindow.fkstPrintPage = api;
    button.disabled = false;
    button.addEventListener("click", () => {
      browserWindow.fkstPrintPage.openPrintView();
    });
    browserWindow.addEventListener("beforeprint", setPrintState);
    browserWindow.addEventListener("afterprint", clearPrintState);

    if (typeof browserWindow.matchMedia === "function") {
      const media = browserWindow.matchMedia("print");
      const syncPrintMedia = (event) => {
        if (event.matches) {
          setPrintState();
        } else {
          clearPrintState();
        }
      };

      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", syncPrintMedia);
      } else if (typeof media.addListener === "function") {
        media.addListener(syncPrintMedia);
      }
    }

    return true;
  }

  if (typeof module === "object" && module.exports) {
    module.exports = {
      activatePrintPageButton,
    };
  }

  if (typeof window === "object") {
    activatePrintPageButton(window);
  }
})();
