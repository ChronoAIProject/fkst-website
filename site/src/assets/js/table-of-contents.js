(() => {
  const navs = Array.from(document.querySelectorAll("[data-toc-nav]"));
  if (navs.length === 0) {
    return;
  }

  const activeOffset = 112;

  const idFromHash = (hash) => {
    if (!hash || hash[0] !== "#") {
      return "";
    }

    const rawId = hash.slice(1);
    try {
      return decodeURIComponent(rawId);
    } catch {
      return rawId;
    }
  };

  navs.forEach((nav) => {
    const entries = Array.from(nav.querySelectorAll("[data-toc-link]"))
      .map((link) => {
        const id = idFromHash(link.getAttribute("href") || "");
        const heading = id ? document.getElementById(id) : null;
        return heading ? { heading, link } : null;
      })
      .filter(Boolean);

    if (entries.length === 0) {
      return;
    }

    let activeLink = null;
    let pendingFrame = 0;

    const setActive = (entry) => {
      if (!entry || activeLink === entry.link) {
        return;
      }

      if (activeLink) {
        activeLink.removeAttribute("aria-current");
        activeLink.removeAttribute("data-toc-current");
      }

      activeLink = entry.link;
      activeLink.setAttribute("aria-current", "location");
      activeLink.setAttribute("data-toc-current", "");
    };

    const entryForCurrentScroll = () => {
      let currentEntry = entries[0];

      for (const entry of entries) {
        if (entry.heading.getBoundingClientRect().top <= activeOffset) {
          currentEntry = entry;
        } else {
          break;
        }
      }

      return currentEntry;
    };

    const refreshFromScroll = () => {
      pendingFrame = 0;
      setActive(entryForCurrentScroll());
    };

    const queueRefresh = () => {
      if (pendingFrame) {
        return;
      }
      pendingFrame = window.requestAnimationFrame(refreshFromScroll);
    };

    const refreshFromHash = () => {
      const hashId = idFromHash(window.location.hash);
      const hashEntry = entries.find((entry) => entry.heading.id === hashId);
      if (hashEntry) {
        setActive(hashEntry);
      }
      window.setTimeout(queueRefresh, 0);
    };

    window.addEventListener("scroll", queueRefresh, { passive: true });
    window.addEventListener("resize", queueRefresh);
    window.addEventListener("hashchange", refreshFromHash);

    if (idFromHash(window.location.hash)) {
      refreshFromHash();
    } else {
      queueRefresh();
    }
  });
})();
