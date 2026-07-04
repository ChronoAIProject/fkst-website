(() => {
  const storageKey = "fkst-docs-sidebar";
  const openValue = "open";
  const closedValue = "closed";
  const shell = document.querySelector("[data-docs-sidebar-shell]");
  const sidebar = document.querySelector("[data-docs-sidebar]");
  const panel = document.querySelector("[data-docs-sidebar-panel]");
  const toggle = document.querySelector("[data-docs-sidebar-toggle]");
  const list = document.querySelector("[data-docs-sidebar-list]");
  const content = document.querySelector("[data-docs-sidebar-content]");

  if (
    !(shell instanceof HTMLElement) ||
    !(sidebar instanceof HTMLElement) ||
    !(panel instanceof HTMLElement) ||
    !(toggle instanceof HTMLButtonElement) ||
    !(list instanceof HTMLElement) ||
    !(content instanceof HTMLElement)
  ) {
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

  const textForHeading = (heading) => {
    const clone = heading.cloneNode(true);
    clone.querySelectorAll("[data-heading-anchor]").forEach((anchor) => anchor.remove());
    return clone.textContent.trim();
  };

  const buildNavigation = () => {
    const headings = Array.from(content.querySelectorAll("h2[id]"));
    const fragment = document.createDocumentFragment();

    for (const heading of headings) {
      const label = textForHeading(heading);
      if (!label) {
        continue;
      }

      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${encodeURIComponent(heading.id)}`;
      link.textContent = label;
      item.append(link);
      fragment.append(item);
    }

    list.replaceChildren(fragment);
    sidebar.toggleAttribute("data-docs-sidebar-empty", list.children.length === 0);
  };

  buildNavigation();
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
