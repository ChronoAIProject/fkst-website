(() => {
  const supportedLocales = Object.freeze(["en", "zh"]);
  const localeDetails = Object.freeze({
    en: Object.freeze({
      code: "en",
      htmlLang: "en",
      label: "EN",
      name: "English",
    }),
    zh: Object.freeze({
      code: "zh",
      htmlLang: "zh-Hans",
      label: "中文",
      name: "Chinese",
    }),
  });
  const defaultLocale = "en";
  const persistenceKey = "fkst-locale";
  const switcherSelector = "[data-locale-switcher]";
  const optionSelector = "[data-locale-option][data-locale-code]";
  const isSupportedLocale = (value) => supportedLocales.includes(value);
  const resolveLocale = (value) => (isSupportedLocale(value) ? value : defaultLocale);

  const storage = () => {
    try {
      return window.localStorage;
    } catch (_error) {
      return null;
    }
  };

  const readStoredLocale = () => {
    const localStorage = storage();
    if (!localStorage) {
      return null;
    }

    try {
      const storedLocale = localStorage.getItem(persistenceKey);
      return isSupportedLocale(storedLocale) ? storedLocale : null;
    } catch (_error) {
      return null;
    }
  };

  const readLocale = () => readStoredLocale() || defaultLocale;

  const persistLocale = (value) => {
    const locale = resolveLocale(value);
    const localStorage = storage();
    if (localStorage) {
      try {
        localStorage.setItem(persistenceKey, locale);
      } catch (_error) {
        return locale;
      }
    }
    return locale;
  };

  const clearStoredLocale = () => {
    const localStorage = storage();
    if (localStorage) {
      try {
        localStorage.removeItem(persistenceKey);
      } catch (_error) {
        return defaultLocale;
      }
    }
    return defaultLocale;
  };

  const normalizePathname = (pathname) => {
    let normalizedPathname = pathname.replace(/\/index\.html$/, "/");
    if (normalizedPathname.length > 1) {
      normalizedPathname = normalizedPathname.replace(/\/+$/, "");
    }
    return normalizedPathname || "/";
  };

  const samePageUrl = (targetHref) => {
    try {
      const currentUrl = new URL(window.location.href);
      const targetUrl = new URL(targetHref, currentUrl.href);
      return (
        currentUrl.origin === targetUrl.origin &&
        normalizePathname(currentUrl.pathname) === normalizePathname(targetUrl.pathname) &&
        currentUrl.search === targetUrl.search
      );
    } catch (_error) {
      return false;
    }
  };

  const localeOptionFor = (root, locale) => {
    if (!root || typeof root.querySelectorAll !== "function") {
      return null;
    }

    return Array.from(root.querySelectorAll(optionSelector)).find(
      (option) => option.getAttribute("data-locale-code") === locale && option.href
    ) || null;
  };

  const switcherCurrentLocale = (switcher) => {
    if (!switcher || typeof switcher.getAttribute !== "function") {
      return null;
    }
    const locale = switcher.getAttribute("data-locale-current");
    return isSupportedLocale(locale) ? locale : null;
  };

  const navigateTo = (href) => {
    window.location.assign(href);
  };

  const redirectToStoredLocale = (navigate = navigateTo) => {
    const storedLocale = readStoredLocale();
    const pageDocument = window.document;
    if (!storedLocale || !pageDocument || typeof pageDocument.querySelector !== "function") {
      return null;
    }

    const switcher = pageDocument.querySelector(switcherSelector);
    const currentLocale = switcherCurrentLocale(switcher);
    if (!switcher || currentLocale === storedLocale) {
      return null;
    }

    const option = localeOptionFor(switcher, storedLocale);
    if (!option || samePageUrl(option.href)) {
      return null;
    }

    navigate(option.href);
    return option.href;
  };

  const persistClickedLocale = (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== "function") {
      return;
    }

    const option = target.closest(optionSelector);
    if (!option || !isSupportedLocale(option.getAttribute("data-locale-code"))) {
      return;
    }

    persistLocale(option.getAttribute("data-locale-code"));
  };

  const bindLocaleSwitcher = () => {
    const pageDocument = window.document;
    if (!pageDocument || typeof pageDocument.querySelectorAll !== "function") {
      return;
    }

    for (const switcher of pageDocument.querySelectorAll(switcherSelector)) {
      if (typeof switcher.addEventListener === "function") {
        switcher.addEventListener("click", persistClickedLocale);
      }
    }
  };

  window.fkstLocale = Object.freeze({
    supportedLocales,
    localeDetails,
    defaultLocale,
    persistenceKey,
    isSupportedLocale,
    resolveLocale,
    readStoredLocale,
    readLocale,
    persistLocale,
    clearStoredLocale,
    redirectToStoredLocale,
  });

  bindLocaleSwitcher();
  redirectToStoredLocale();
})();
