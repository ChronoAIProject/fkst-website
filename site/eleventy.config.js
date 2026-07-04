const { extractTocEntries } = require("./src/_includes/toc.js");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy("probe-manifest");
  eleventyConfig.addFilter("tocEntries", extractTocEntries);

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
