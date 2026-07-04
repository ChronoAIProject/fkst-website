(() => {
  const supportedThemes = Object.freeze(["light", "dark"]);
  const defaultTheme = "light";
  const isSupportedTheme = (value) => supportedThemes.includes(value);
  const resolveTheme = (value) => (isSupportedTheme(value) ? value : defaultTheme);

  const readTheme = () => defaultTheme;
  const applyTheme = (value) => resolveTheme(value);
  const persistTheme = (value) => resolveTheme(value);

  window.fkstTheme = Object.freeze({
    supportedThemes,
    defaultTheme,
    isSupportedTheme,
    readTheme,
    applyTheme,
    persistTheme,
  });
})();
