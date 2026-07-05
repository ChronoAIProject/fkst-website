"use strict";

const defaultLocale = "en";
const persistenceKey = "fkst-locale";
const supportedLocales = Object.freeze([
  Object.freeze({
    code: "en",
    htmlLang: "en",
    label: "EN",
    name: "English",
  }),
  Object.freeze({
    code: "zh",
    htmlLang: "zh-Hans",
    label: "中文",
    name: "Chinese",
  }),
]);

function isSupportedLocale(value) {
  return supportedLocales.some((locale) => locale.code === value);
}

function resolveLocale(value) {
  return isSupportedLocale(value) ? value : defaultLocale;
}

module.exports = {
  defaultLocale,
  isSupportedLocale,
  persistenceKey,
  resolveLocale,
  supportedLocales,
};
