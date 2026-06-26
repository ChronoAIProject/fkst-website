export const repoLinks = [
  {
    label: "fkst-substrate",
    href: "https://github.com/ChronoAIProject/fkst-substrate",
  },
  {
    label: "fkst-packages",
    href: "https://github.com/ChronoAIProject/fkst-packages",
  },
  {
    label: "fkst-website",
    href: "https://github.com/ChronoAIProject/fkst-website",
  },
];

export const defaultFooterText = {
  en: "This site is built and maintained as a normal Astro static website.",
  zh: "本站作为常规 Astro 静态网站构建与维护。",
};

export const homeLinkText = {
  en: "Back to home",
  zh: "返回首页",
};

const pageFiles = {
  home: {
    en: "index.html",
    zh: "zh/",
  },
  architecture: {
    en: "architecture.html",
    zh: "zh/architecture.html",
  },
  doctrine: {
    en: "doctrine.html",
    zh: "zh/doctrine.html",
  },
  about: {
    en: "about.html",
    zh: "zh/about.html",
  },
};

const navLabels = {
  en: {
    home: "Home",
    architecture: "Architecture",
    doctrine: "Doctrine",
    about: "About",
  },
  zh: {
    home: "首页",
    architecture: "架构",
    doctrine: "信条",
    about: "关于",
  },
};

export function resolveLang(lang) {
  return lang === "zh-Hans" || lang === "zh" ? "zh" : "en";
}

function dirname(filePath) {
  const index = filePath.lastIndexOf("/");
  return index === -1 ? "" : filePath.slice(0, index);
}

function relativeFrom(currentDir, targetPath) {
  const from = currentDir === "" ? [] : currentDir.split("/");
  const to = targetPath.split("/");
  const targetEndsWithSlash = targetPath.endsWith("/");
  const targetFile = targetEndsWithSlash ? "" : to.pop();
  let common = 0;
  while (from[common] && from[common] === to[common]) {
    common += 1;
  }

  const segments = [
    ...from.slice(common).map(() => ".."),
    ...to.slice(common),
    targetFile,
  ].filter(Boolean);

  const relativePath = segments.join("/");
  if (targetEndsWithSlash) {
    return relativePath ? `${relativePath}/` : ".";
  }
  return relativePath || targetFile;
}

export function getHref(currentLocale, currentPage, targetLocale, targetPage) {
  return relativeFrom(
    dirname(pageFiles[currentPage][currentLocale]),
    pageFiles[targetPage][targetLocale],
  );
}

export function getAssetHref(locale, currentPage, assetPath) {
  return relativeFrom(dirname(pageFiles[currentPage][locale]), assetPath);
}

export function getBrandHref(locale, currentPage) {
  return getHref(locale, currentPage, "en", "home");
}

export function getNav(locale, currentPage) {
  const labels = navLabels[locale];
  return [
    "home",
    "architecture",
    "doctrine",
    "about",
  ].map((key) => ({
    label: labels[key],
    href: getHref(locale, currentPage, locale, key),
    current: key === currentPage,
  })).concat(repoLinks);
}

export function getLanguageSwitch(locale, pageKey) {
  return [
    {
      label: "EN",
      href: getHref(locale, pageKey, "en", pageKey),
      current: locale === "en",
    },
    {
      label: "中文",
      href: getHref(locale, pageKey, "zh", pageKey),
      current: locale === "zh",
    },
  ];
}
