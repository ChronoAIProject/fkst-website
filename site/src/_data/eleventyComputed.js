"use strict";

const path = require("node:path");
const { pageLastUpdated } = require("../_includes/utils/last-updated");

const SITE_ROOT = path.resolve(__dirname, "../..");

module.exports = {
  lastUpdated(data) {
    return pageLastUpdated(data, { siteRoot: SITE_ROOT });
  },
};
