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
  });
})();
