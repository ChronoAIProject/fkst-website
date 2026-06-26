import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  outDir: "./_site",
  build: {
    format: "preserve",
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en", "zh"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
