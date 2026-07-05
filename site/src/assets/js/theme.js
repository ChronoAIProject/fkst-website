(() => {
  const supportedThemes = Object.freeze(["light", "dark"]);
  const defaultTheme = "light";
  const storageKey = "fkst-theme";
  const themeAttribute = "data-theme";
  const toggleSelector = "[data-theme-toggle-button]";
  const isSupportedTheme = (value) => supportedThemes.includes(value);
  const resolveTheme = (value) => (isSupportedTheme(value) ? value : defaultTheme);
  const nextTheme = (value) => (resolveTheme(value) === "dark" ? "light" : "dark");
  const systemTheme = () => {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : defaultTheme;
    } catch (_error) {
      return defaultTheme;
    }
  };

  const storage = () => {
    try {
      return window.localStorage;
    } catch (_error) {
      return null;
    }
  };

  const readStoredTheme = () => {
    const localStorage = storage();
    if (!localStorage) {
      return null;
    }

    try {
      const storedTheme = localStorage.getItem(storageKey);
      return isSupportedTheme(storedTheme) ? storedTheme : null;
    } catch (_error) {
      return null;
    }
  };

  const readTheme = () => readStoredTheme() || systemTheme();

  const updateToggle = (button, theme) => {
    if (!button) {
      return;
    }

    const resolvedTheme = resolveTheme(theme);
    const isDark = resolvedTheme === "dark";
    button.setAttribute("aria-checked", String(isDark));
    button.setAttribute(
      "aria-label",
      isDark ? "Switch to light theme" : "Switch to dark theme"
    );
    button.dataset.theme = resolvedTheme;
  };

  const applyTheme = (value) => {
    const theme = resolveTheme(value);
    document.documentElement.setAttribute(themeAttribute, theme);
    document.documentElement.style.colorScheme = theme;
    document.querySelectorAll(toggleSelector).forEach((button) => {
      updateToggle(button, theme);
    });
    return theme;
  };

  const clearThemeOverride = () => {
    const theme = readTheme();
    document.documentElement.removeAttribute(themeAttribute);
    document.documentElement.style.colorScheme = "";
    document.querySelectorAll(toggleSelector).forEach((button) => {
      updateToggle(button, theme);
    });
    return theme;
  };

  const persistTheme = (value) => {
    const theme = resolveTheme(value);
    const localStorage = storage();
    if (localStorage) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch (_error) {
        return theme;
      }
    }
    return theme;
  };

  const setTheme = (value) => {
    const theme = persistTheme(value);
    applyTheme(theme);
    return theme;
  };

  const activeTheme = () => {
    const activeOverride = document.documentElement.getAttribute(themeAttribute);
    return isSupportedTheme(activeOverride) ? activeOverride : readTheme();
  };

  const initThemeToggle = () => {
    const buttons = document.querySelectorAll(toggleSelector);
    const storedTheme = readStoredTheme();
    const theme = storedTheme ? applyTheme(storedTheme) : clearThemeOverride();
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        setTheme(nextTheme(activeTheme()));
      });
    });
    return theme;
  };

  window.fkstTheme = Object.freeze({
    supportedThemes,
    defaultTheme,
    isSupportedTheme,
    readTheme,
    applyTheme,
    persistTheme,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeToggle, { once: true });
  } else {
    initThemeToggle();
  }
})();
