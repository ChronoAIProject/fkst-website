const markdownIt = require("markdown-it");
const { addCodeBlockCopyControls } = require("./lib/codeBlockCopy");
const {
  addExternalLinkMarkers,
  externalLinkAttributes,
  externalLinkMarker,
  shouldUseEleventyUrlFilter,
} = require("./lib/externalLinks");
const { addHeadingAnchors, renderHeadingAnchor } = require("./lib/headingAnchors");
const { lastUpdatedMetadata } = require("./src/_includes/utils/last-updated");
const { estimateReadingTime } = require("./src/_includes/utils/reading-time");

module.exports = function (eleventyConfig) {
  const markdownLibrary = addExternalLinkMarkers(
    addHeadingAnchors(addCodeBlockCopyControls(markdownIt({ html: true })))
  );

  eleventyConfig.addFilter("externalLinkMarker", externalLinkMarker);
  eleventyConfig.addFilter("externalLinkAttributes", externalLinkAttributes);
  eleventyConfig.addFilter("shouldUseEleventyUrl", shouldUseEleventyUrlFilter);
  eleventyConfig.addFilter("lastUpdatedMetadata", lastUpdatedMetadata);
  eleventyConfig.addFilter("readingTime", estimateReadingTime);
  eleventyConfig.addShortcode("headingAnchor", (id, label) => {
    return renderHeadingAnchor({ id, label });
  });
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
