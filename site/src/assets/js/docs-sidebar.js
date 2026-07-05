(() => {
  const storageKey = "fkst-docs-sidebar";
  const openValue = "open";
  const closedValue = "closed";
  const shell = document.querySelector("[data-docs-sidebar-shell]");
  const sidebar = document.querySelector("[data-docs-sidebar]");
  const panel = document.querySelector("[data-docs-sidebar-panel]");
  const toggle = document.querySelector("[data-docs-sidebar-toggle]");
  const list = document.querySelector("[data-docs-sidebar-list]");

  if (
    !(shell instanceof HTMLElement) ||
    !(sidebar instanceof HTMLElement) ||
    !(panel instanceof HTMLElement) ||
    !(toggle instanceof HTMLButtonElement) ||
    !(list instanceof HTMLElement)
  ) {
    return;
  }

  const hasNavigation = list.querySelector("a[href]") !== null;
  sidebar.toggleAttribute("data-docs-sidebar-empty", !hasNavigation);
  shell.toggleAttribute("data-docs-sidebar-empty", !hasNavigation);

  if (!hasNavigation) {
    panel.hidden = true;
    toggle.disabled = true;
    toggle.setAttribute("aria-expanded", "false");
    return;
  }

  const storage = () => {
    try {
      return window.localStorage;
    } catch (_error) {
      return null;
    }
  };

  const isSupportedState = (value) => value === openValue || value === closedValue;

  const readStoredState = () => {
    const localStorage = storage();
    if (!localStorage) {
      return null;
    }

    try {
      const value = localStorage.getItem(storageKey);
      return isSupportedState(value) ? value : null;
    } catch (_error) {
      return null;
    }
  };

  const persistState = (state) => {
    const localStorage = storage();
    if (!localStorage) {
      return;
    }

    try {
      localStorage.setItem(storageKey, state);
    } catch (_error) {
      // Storage is progressive enhancement; the visible state still changes.
    }
  };

  const setOpen = (isOpen, options = {}) => {
    const state = isOpen ? openValue : closedValue;
    shell.dataset.docsSidebarState = state;
    sidebar.dataset.docsSidebarState = state;
    panel.toggleAttribute("hidden", !isOpen);
    shell.toggleAttribute("data-docs-sidebar-open", isOpen);
    shell.toggleAttribute("data-docs-sidebar-closed", !isOpen);
    document.documentElement.setAttribute("data-docs-sidebar-state", state);
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Hide docs sidebar" : "Show docs sidebar");

    if (options.persist !== false) {
      persistState(state);
    }
  };

  const isOpen = () => shell.dataset.docsSidebarState !== closedValue;
  const toggleOpen = () => setOpen(!isOpen());

  const isEditableTarget = (target) => {
    if (!(target instanceof Element)) {
      return false;
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      return true;
    }

    return Boolean(target.closest("input, textarea, select"));
  };

  const shortcutMatches = (event) => {
    if (event.defaultPrevented || event.altKey || event.shiftKey) {
      return false;
    }
    if (event.key.toLowerCase() !== "b") {
      return false;
    }

    return (event.metaKey && !event.ctrlKey) || (event.ctrlKey && !event.metaKey);
  };

  setOpen(readStoredState() !== closedValue, { persist: false });

  toggle.disabled = false;
  toggle.addEventListener("click", toggleOpen);

  document.addEventListener("keydown", (event) => {
    if (!shortcutMatches(event) || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    toggleOpen();
  });
})();
