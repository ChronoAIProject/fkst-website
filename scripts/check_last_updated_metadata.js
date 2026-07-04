#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  FALLBACK_DATE,
  isValidDateOnly,
  lastUpdatedForInputPath,
  lastUpdatedMetadata,
  normalizeDateOnly,
  pageLastUpdated
} = require("../site/src/_includes/utils/last-updated");

const FIXED_COMMIT_DATE = "2024-03-17";
const FIXED_COMMIT_TIMESTAMP = `${FIXED_COMMIT_DATE}T12:34:56Z`;

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env
    },
    stdio: "ignore"
  });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });
  fs.writeFileSync(filePath, content, "utf8");
}

function withTemporaryDirectory(callback) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fkst-last-updated-")));
  try {
    callback(directory);
  } finally {
    fs.rmSync(directory, {
      force: true,
      recursive: true
    });
  }
}

function withRepositoryFixture(callback) {
  withTemporaryDirectory((directory) => {
    const repoRoot = path.join(directory, "repo");
    const siteRoot = path.join(repoRoot, "site");
    const trackedPath = path.join(siteRoot, "src", "tracked.njk");

    fs.mkdirSync(repoRoot, {
      recursive: true
    });
    run("git", ["init", "--quiet"], {
      cwd: repoRoot
    });
    run("git", ["config", "user.email", "tests@example.invalid"], {
      cwd: repoRoot
    });
    run("git", ["config", "user.name", "Last Updated Tests"], {
      cwd: repoRoot
    });
    writeFile(trackedPath, "Tracked fixture.\n");
    run("git", ["add", "site/src/tracked.njk"], {
      cwd: repoRoot
    });
    run("git", ["commit", "--quiet", "-m", "Add tracked fixture"], {
      cwd: repoRoot,
      env: {
        GIT_AUTHOR_DATE: FIXED_COMMIT_TIMESTAMP,
        GIT_COMMITTER_DATE: FIXED_COMMIT_TIMESTAMP
      }
    });

    callback({
      repoRoot,
      siteRoot,
      trackedPath
    });
  });
}

function testDateValidationAndNormalization() {
  assert.equal(isValidDateOnly("2024-02-29"), true);
  assert.equal(isValidDateOnly("2024-02-30"), false);
  assert.equal(isValidDateOnly("not-a-date"), false);
  assert.equal(isValidDateOnly(" 2024-02-29 "), false);

  assert.equal(normalizeDateOnly("2024-02-29"), "2024-02-29");
  assert.equal(normalizeDateOnly(" 2024-02-29 "), "2024-02-29");
  assert.equal(normalizeDateOnly("2024-02-30"), null);
  assert.equal(normalizeDateOnly("not-a-date"), null);
  assert.equal(normalizeDateOnly(""), null);
  assert.equal(normalizeDateOnly("   "), null);
  assert.equal(normalizeDateOnly(new Date("not-a-date")), null);
  assert.equal(
    normalizeDateOnly(new Date(Date.UTC(2024, 6, 4, 16, 30, 0))),
    "2024-07-04"
  );
}

function testMetadataContract() {
  assert.deepEqual(lastUpdatedMetadata("2024-02-29"), {
    datetime: "2024-02-29",
    label: "2024-02-29"
  });
  assert.deepEqual(lastUpdatedMetadata(" 2024-02-29 "), {
    datetime: "2024-02-29",
    label: "2024-02-29"
  });
  assert.deepEqual(lastUpdatedMetadata(new Date(Date.UTC(2024, 0, 2))), {
    datetime: "2024-01-02",
    label: "2024-01-02"
  });

  assert.equal(lastUpdatedMetadata("2024-13-01"), null);
  assert.equal(lastUpdatedMetadata("not-a-date"), null);
  assert.equal(lastUpdatedMetadata(""), null);
  assert.equal(lastUpdatedMetadata(new Date("not-a-date")), null);
}

function testTrackedFileUsesGitDate() {
  withRepositoryFixture(({ siteRoot, trackedPath }) => {
    assert.equal(
      lastUpdatedForInputPath("src/tracked.njk", {
        siteRoot
      }),
      FIXED_COMMIT_DATE
    );
    assert.equal(
      lastUpdatedForInputPath("./src/tracked.njk", {
        siteRoot
      }),
      FIXED_COMMIT_DATE
    );
    assert.equal(
      lastUpdatedForInputPath(trackedPath, {
        siteRoot
      }),
      FIXED_COMMIT_DATE
    );
    assert.equal(
      pageLastUpdated({
        page: {
          inputPath: "src/tracked.njk"
        }
      }, {
        siteRoot
      }),
      FIXED_COMMIT_DATE
    );
  });
}

function testFallbackForMissingAndUnsafePaths() {
  withRepositoryFixture(({ repoRoot, siteRoot }) => {
    const outsidePath = path.join(path.dirname(repoRoot), "outside.njk");
    writeFile(outsidePath, "Outside fixture.\n");

    assert.equal(lastUpdatedForInputPath("", {
      repoRoot,
      siteRoot
    }), FALLBACK_DATE);
    assert.equal(pageLastUpdated({}, {
      repoRoot,
      siteRoot
    }), FALLBACK_DATE);
    assert.equal(pageLastUpdated({
      page: {}
    }, {
      repoRoot,
      siteRoot
    }), FALLBACK_DATE);
    assert.equal(lastUpdatedForInputPath("src/missing.njk", {
      repoRoot,
      siteRoot
    }), FALLBACK_DATE);
    assert.equal(lastUpdatedForInputPath(outsidePath, {
      repoRoot,
      siteRoot
    }), FALLBACK_DATE);
  });
}

function testFallbackWithoutGitMetadata() {
  withTemporaryDirectory((directory) => {
    const siteRoot = path.join(directory, "site");
    writeFile(path.join(siteRoot, "src", "page.njk"), "Untracked fixture.\n");

    assert.equal(lastUpdatedForInputPath("src/page.njk", {
      siteRoot
    }), FALLBACK_DATE);
    assert.equal(pageLastUpdated({
      page: {
        inputPath: "src/page.njk"
      }
    }, {
      siteRoot
    }), FALLBACK_DATE);
  });
}

function main() {
  const tests = [
    testDateValidationAndNormalization,
    testMetadataContract,
    testTrackedFileUsesGitDate,
    testFallbackForMissingAndUnsafePaths,
    testFallbackWithoutGitMetadata
  ];

  for (const test of tests) {
    test();
  }

  console.log(`fkst-website dept=site tag=ok LAST_UPDATED_METADATA tests=${tests.length}`);
}

main();
