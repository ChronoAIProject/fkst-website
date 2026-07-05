(() => {
  const storageKey = "fkst-docs-sidebar";
  const openValue = "open";
  const closedValue = "closed";
  const shell = document.querySelector("[data-docs-sidebar-shell]");
  const sidebar = document.querySelector("[data-docs-sidebar]");
  const panel = document.querySelector("[data-docs-sidebar-panel]");
  const toggle = document.querySelector("[data-docs-sidebar-toggle]");
  const list = document.querySelector("[data-docs-sidebar-list]");
  const activeAttribute = "aria-current";

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
  const links = Array.from(list.querySelectorAll("[data-docs-toc-link]"))
    .filter((link) => link instanceof HTMLAnchorElement);
  const decodeFragment = (value) => {
    const normalized = String(value || "").replace(/^#/, "");
    if (!normalized) {
      return "";
    }

    try {
      return decodeURIComponent(normalized);
    } catch (_error) {
      return normalized;
    }
  };
  const linkTargetId = (link) => decodeFragment(link.hash || link.getAttribute("href"));
  const targets = links
    .map((link) => {
      const id = linkTargetId(link);
      const target = id ? document.getElementById(id) : null;
      return target ? { id, link, target } : null;
    })
    .filter(Boolean);
  let activeLink = null;
  let updateQueued = false;

  const setActiveLink = (link) => {
    if (activeLink === link) {
      return;
    }
    if (activeLink) {
      activeLink.removeAttribute(activeAttribute);
    }
    activeLink = link;
    if (activeLink) {
      activeLink.setAttribute(activeAttribute, "location");
    }
  };

  const activateTargetId = (id) => {
    const target = targets.find((item) => item.id === id);
    setActiveLink(target ? target.link : null);
    return Boolean(target);
  };

  const activateFromHash = () => activateTargetId(decodeFragment(window.location.hash));

  const viewportAnchor = () => Math.max(80, Math.round(window.innerHeight * 0.2));

  const updateActiveFromScroll = () => {
    updateQueued = false;
    if (targets.length === 0) {
      setActiveLink(null);
      return;
    }

    const threshold = viewportAnchor();
    let activeTarget = targets[0];
    for (const target of targets) {
      const box = target.target.getBoundingClientRect();
      if (box.top <= threshold) {
        activeTarget = target;
      } else {
        break;
      }
    }
    setActiveLink(activeTarget.link);
  };

  const scheduleScrollUpdate = () => {
    if (updateQueued) {
      return;
    }
    updateQueued = true;

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(updateActiveFromScroll);
    } else {
      window.setTimeout(updateActiveFromScroll, 16);
    }
  };

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
  if (!window.location.hash || !activateFromHash()) {
    scheduleScrollUpdate();
  }

  toggle.disabled = false;
  toggle.addEventListener("click", toggleOpen);
  for (const link of links) {
    link.addEventListener("click", () => {
      activateTargetId(linkTargetId(link));
    });
  }

  window.addEventListener("hashchange", () => {
    if (!window.location.hash) {
      setActiveLink(null);
      return;
    }
    activateFromHash();
  });
  window.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
  window.addEventListener("resize", scheduleScrollUpdate);

  document.addEventListener("keydown", (event) => {
    if (!shortcutMatches(event) || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    toggleOpen();
  });
})();
