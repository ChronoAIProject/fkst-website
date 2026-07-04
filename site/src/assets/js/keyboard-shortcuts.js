(() => {
  const overlay = document.querySelector("[data-keyboard-shortcut-overlay]");
  if (
    typeof HTMLDialogElement !== "function" ||
    !(overlay instanceof HTMLDialogElement) ||
    typeof overlay.showModal !== "function"
  ) {
    return;
  }

  const closeButton = overlay.querySelector("[data-keyboard-shortcut-close]");
  const panel = overlay.querySelector("[data-keyboard-shortcut-panel]");
  let returnFocusTarget = null;

  const isEditableTarget = (target) => {
    if (!(target instanceof Element)) {
      return false;
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      return true;
    }

    return Boolean(target.closest("input, textarea, select"));
  };

  const restoreFocus = () => {
    if (returnFocusTarget instanceof HTMLElement && document.contains(returnFocusTarget)) {
      returnFocusTarget.focus();
    }
    returnFocusTarget = null;
  };

  const openOverlay = () => {
    if (overlay.open) {
      return;
    }

    returnFocusTarget = document.activeElement;
    overlay.showModal();

    if (closeButton instanceof HTMLButtonElement) {
      closeButton.focus();
    }
  };

  const closeOverlay = () => {
    if (!overlay.open) {
      return;
    }

    overlay.close();
  };

  if (closeButton instanceof HTMLButtonElement) {
    closeButton.disabled = false;
    closeButton.addEventListener("click", closeOverlay);
  }

  overlay.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeOverlay();
  });
  overlay.addEventListener("close", restoreFocus);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || (panel instanceof Element && !panel.contains(event.target))) {
      closeOverlay();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.key !== "?" || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    openOverlay();
  });
})();
