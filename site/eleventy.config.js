const markdownIt = require("markdown-it");
const { addCodeBlockCopyControls } = require("./lib/codeBlockCopy");
const {
  addExternalLinkMarkers,
  externalLinkAttributes,
  externalLinkMarker,
  shouldUseEleventyUrlFilter,
} = require("./lib/externalLinks");
const { extractTocEntries } = require("./src/_includes/toc");
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
  eleventyConfig.addFilter("tocEntries", extractTocEntries);
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
