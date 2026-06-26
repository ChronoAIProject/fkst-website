return {
  pages = {
    {
      slug = "about",
      layout = "layouts/page.njk",
      translations = {
        en = {
          lang = "en",
          title_key = "about.title",
          description_key = "about.description",
          nav = {
            { label_key = "nav.home", href = "/" },
            { label_key = "nav.architecture", href = "/architecture.html" },
            { label_key = "nav.doctrine", href = "/doctrine.html" },
          },
          footer_key = "about.footer",
          body_keys = {
            "about.body.heading",
            "about.body.blank1",
            "about.body.intro",
            "about.body.blank2",
            "about.body.boundary",
            "about.body.blank3",
            "about.body.proof",
          },
        },
        zh = {
          lang = "zh-Hans",
          title_key = "about.title",
          description_key = "about.description",
          nav = {
            { label_key = "nav.home", href = "/zh/" },
            { label_key = "nav.architecture", href = "/zh/architecture.html" },
            { label_key = "nav.doctrine", href = "/zh/doctrine.html" },
          },
          footer_key = "about.footer",
          body_keys = {
            "about.body.heading",
            "about.body.blank1",
            "about.body.intro",
            "about.body.blank2",
            "about.body.boundary",
            "about.body.blank3",
            "about.body.proof",
          },
        },
      },
    },
  },
}
