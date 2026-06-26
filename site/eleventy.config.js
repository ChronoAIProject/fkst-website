module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy("architecture.html");
  eleventyConfig.addPassthroughCopy("doctrine.html");
  eleventyConfig.addPassthroughCopy("zh/architecture.html");
  eleventyConfig.addPassthroughCopy("zh/doctrine.html");
  eleventyConfig.addPassthroughCopy("probe-manifest");

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
