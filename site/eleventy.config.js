const { addCodeBlockCopyControls } = require("./lib/codeBlockCopy");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy("probe-manifest");
  eleventyConfig.amendLibrary("md", addCodeBlockCopyControls);

  return {
    pathPrefix: "/fkst-website/",
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk"],
    dir: {
      input: "src",
      includes: "_includes",
      output: "_site"
    }
  };
};
