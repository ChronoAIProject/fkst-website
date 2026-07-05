const markdownIt = require("markdown-it");
const { addCodeBlockCopyControls } = require("./lib/codeBlockCopy");
const {
  docsTocEntriesForPage,
  docsTocHref,
  recordDocsTocEntry,
  resetDocsTocRegistry,
} = require("./lib/docsToc");
const {
  addExternalLinkMarkers,
  externalLinkAttributes,
  externalLinkMarker,
  shouldUseEleventyUrlFilter,
} = require("./lib/externalLinks");
const { renderHeadingAnchor } = require("./lib/headingAnchors");
const { lastUpdatedMetadata } = require("./src/_includes/utils/last-updated");
const { estimateReadingTime } = require("./src/_includes/utils/reading-time");

module.exports = function (eleventyConfig) {
  const markdownLibrary = addExternalLinkMarkers(
    addCodeBlockCopyControls(markdownIt({ html: true }))
  );

  eleventyConfig.addFilter("externalLinkMarker", externalLinkMarker);
  eleventyConfig.addFilter("externalLinkAttributes", externalLinkAttributes);
  eleventyConfig.addFilter("shouldUseEleventyUrl", shouldUseEleventyUrlFilter);
  eleventyConfig.addFilter("lastUpdatedMetadata", lastUpdatedMetadata);
  eleventyConfig.addFilter("readingTime", estimateReadingTime);
  eleventyConfig.addFilter("docsTocEntries", docsTocEntriesForPage);
  eleventyConfig.addFilter("docsTocHref", docsTocHref);
  eleventyConfig.addShortcode("headingAnchor", function (id, title, label, level = 2) {
    recordDocsTocEntry(this.page, { id, title, level, depth: level });
    return renderHeadingAnchor({ id, label });
  });
  eleventyConfig.on("eleventy.before", resetDocsTocRegistry);
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy("probe-manifest");
  eleventyConfig.setLibrary("md", markdownLibrary);
  eleventyConfig.amendLibrary("md", (mdLibrary) => {
    mdLibrary.enable("code");
  });

  return {
    pathPrefix: "/fkst-website/",
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md"],
    dir: {
      input: "src",
      includes: "_includes",
      output: "_site"
    }
  };
};
