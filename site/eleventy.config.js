const markdownIt = require("markdown-it");
const { addCodeBlockCopyControls } = require("./lib/codeBlockCopy");
const { estimateReadingTime } = require("./src/_includes/utils/reading-time");

module.exports = function (eleventyConfig) {
  const markdownLibrary = addCodeBlockCopyControls(markdownIt({ html: true }));

  eleventyConfig.addFilter("readingTime", estimateReadingTime);
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
