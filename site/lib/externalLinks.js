"use strict";

const DEFAULT_SITE_URL = "https://chronoaiproject.github.io/fkst-website/";

function parseHttpLinkTarget(href, siteUrl = DEFAULT_SITE_URL) {
  if (typeof href !== "string") {
    return null;
  }

  const target = href.trim();
  if (!target || target.startsWith("#")) {
    return null;
  }

  const hasScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target);
  const isProtocolRelative = target.startsWith("//");
  if (!hasScheme && !isProtocolRelative) {
    return null;
  }

  let url;
  try {
    url = new URL(target, siteUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  return url;
}

function isExternalLinkTarget(href, siteUrl = DEFAULT_SITE_URL) {
  const target = parseHttpLinkTarget(href, siteUrl);
  if (!target) {
    return false;
  }

  return target.origin !== new URL(siteUrl).origin;
}

function shouldUseEleventyUrlFilter(href) {
  if (typeof href !== "string") {
    return false;
  }

  const target = href.trim();
  return Boolean(target) && !target.startsWith("#") && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target);
}

function renderExternalLinkMarker() {
  return [
    '<span class="external-link-marker" aria-hidden="true"></span>',
    '<span class="visually-hidden">External link</span>',
  ].join("");
}

function externalLinkMarker(href, siteUrl = DEFAULT_SITE_URL) {
  return isExternalLinkTarget(href, siteUrl) ? renderExternalLinkMarker() : "";
}

function addExternalLinkMarkers(markdownLibrary, siteUrl = DEFAULT_SITE_URL) {
  const { rules } = markdownLibrary.renderer;
  const renderLinkOpen = rules.link_open;
  const renderLinkClose = rules.link_close;
  const externalLinkStack = [];

  rules.link_open = function (...args) {
    const [tokens, idx, options, env, self] = args;
    const token = tokens[idx];
    const isExternal = isExternalLinkTarget(token.attrGet("href"), siteUrl);
    externalLinkStack.push(isExternal);

    if (isExternal) {
      token.attrJoin("class", "external-link");
      token.attrSet("data-external-link", "");
    }

    if (renderLinkOpen) {
      return renderLinkOpen.apply(this, args);
    }
    return self.renderToken(tokens, idx, options, env);
  };

  rules.link_close = function (...args) {
    const [tokens, idx, options, env, self] = args;
    const isExternal = externalLinkStack.pop();
    const html = renderLinkClose
      ? renderLinkClose.apply(this, args)
      : self.renderToken(tokens, idx, options, env);

    return isExternal ? `${renderExternalLinkMarker()}${html}` : html;
  };

  return markdownLibrary;
}

module.exports = {
  DEFAULT_SITE_URL,
  addExternalLinkMarkers,
  externalLinkMarker,
  isExternalLinkTarget,
  parseHttpLinkTarget,
  renderExternalLinkMarker,
  shouldUseEleventyUrlFilter,
};
