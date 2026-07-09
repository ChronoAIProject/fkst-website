import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const fixtureUrl = new URL(
  "../src/data/fixtures/fkst.site.board.v1.json",
  import.meta.url,
);
const siteRoot = fileURLToPath(new URL("../", import.meta.url));
const statusEntry = fileURLToPath(
  new URL("../src/pages/status/index.astro", import.meta.url),
);
const statusHtmlUrl = new URL("../_site/status/index.html", import.meta.url);
const astroCli = fileURLToPath(
  new URL("../node_modules/astro/bin/astro.mjs", import.meta.url),
);
const snapshotFilename = "fkst.site.board.v1.json";
const execFileAsync = promisify(execFile);

function assertIncludes(html, expected, description) {
  if (!html.includes(expected)) {
    throw new Error(`status page missing ${description}: ${expected}`);
  }
}

function assertExcludes(html, unexpected, description) {
  if (html.includes(unexpected)) {
    throw new Error(`status page unexpectedly contains ${description}: ${unexpected}`);
  }
}

async function resolveLocalImport(importer, specifier) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  if (!cleanSpecifier.startsWith(".")) {
    return null;
  }

  const base = resolve(dirname(importer), cleanSpecifier);
  const candidates = extname(base)
    ? [base]
    : [base, `${base}.astro`, `${base}.js`, `${base}.mjs`, `${base}.json`];

  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) {
        return candidate;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  throw new Error(`cannot resolve local import ${specifier} from ${importer}`);
}

async function collectLocalImportGraph(entry) {
  const graph = new Set();
  const pending = [entry];
  const importPatterns = [
    /\b(?:import|export)\s+(?:[^"'`]*?\s+from\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  while (pending.length > 0) {
    const current = pending.pop();
    if (graph.has(current)) {
      continue;
    }
    graph.add(current);
    const source = await readFile(current, "utf8");
    for (const pattern of importPatterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const dependency = await resolveLocalImport(current, match[1]);
        if (dependency !== null && !graph.has(dependency)) {
          pending.push(dependency);
        }
      }
    }
  }

  return graph;
}

async function buildStatus(siteOut) {
  const env = { ...process.env, FKST_SITE_OUT: siteOut };
  await execFileAsync(process.execPath, [astroCli, "build"], {
    cwd: siteRoot,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return readFile(statusHtmlUrl, "utf8");
}

const fixturePath = fileURLToPath(fixtureUrl);
const importGraph = await collectLocalImportGraph(statusEntry);
if (importGraph.has(fixturePath)) {
  throw new Error("the production /status import graph reaches the committed fixture");
}

const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const firstIssue = fixture.issues[0];
const generatedAt = new Date("2026-07-09T20:00:00.000Z");
const temporaryRoot = await mkdtemp(join(tmpdir(), "fkst-status-test-"));

try {
  const validSiteOut = join(temporaryRoot, "valid");
  await mkdir(validSiteOut);
  const validSnapshotPath = join(validSiteOut, snapshotFilename);
  await copyFile(fixturePath, validSnapshotPath);
  await utimes(validSnapshotPath, generatedAt, generatedAt);

  const validHtml = await buildStatus(validSiteOut);
  assertIncludes(validHtml, fixture.schema_version, "schema version");
  assertIncludes(validHtml, fixture.repo, "repository name");
  assertIncludes(validHtml, `#${firstIssue.number}`, "first issue number");
  assertIncludes(validHtml, firstIssue.title, "first issue title");
  assertIncludes(validHtml, firstIssue.updatedAt, "first issue update timestamp");
  assertIncludes(validHtml, firstIssue.url, "first issue URL");
  assertIncludes(validHtml, generatedAt.toISOString(), "generation timestamp");
  assertIncludes(validHtml, "GitHub open issues and pull requests", "source provenance");
  assertExcludes(validHtml, "Snapshot unavailable", "unavailable state");

  const missingSiteOut = join(temporaryRoot, "missing");
  await mkdir(missingSiteOut);
  const missingHtml = await buildStatus(missingSiteOut);
  assertIncludes(missingHtml, "Snapshot unavailable", "missing-input state");
  assertExcludes(missingHtml, firstIssue.title, "fixture row for missing input");

  const invalidSiteOut = join(temporaryRoot, "invalid");
  await mkdir(invalidSiteOut);
  await writeFile(join(invalidSiteOut, snapshotFilename), "{}", "utf8");
  const invalidHtml = await buildStatus(invalidSiteOut);
  assertIncludes(invalidHtml, "Snapshot unavailable", "invalid-input state");
  assertExcludes(invalidHtml, firstIssue.title, "fixture row for invalid input");

  const fixtureDirectoryHtml = await buildStatus(dirname(fixturePath));
  assertIncludes(
    fixtureDirectoryHtml,
    "Snapshot unavailable",
    "fixture-directory rejection",
  );
  assertExcludes(
    fixtureDirectoryHtml,
    firstIssue.title,
    "fixture row from direct fixture configuration",
  );

  const fixtureDirectoryLink = join(temporaryRoot, "fixture-directory-link");
  await symlink(dirname(fixturePath), fixtureDirectoryLink, "dir");
  const linkedFixtureDirectoryHtml = await buildStatus(fixtureDirectoryLink);
  assertIncludes(
    linkedFixtureDirectoryHtml,
    "Snapshot unavailable",
    "linked fixture-directory rejection",
  );
  assertExcludes(
    linkedFixtureDirectoryHtml,
    firstIssue.title,
    "fixture row from linked fixture configuration",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

console.log(
  [
    "fkst-website",
    "dept=status",
    "tag=ok",
    "valid=generated",
    "missing=unavailable",
    "invalid=unavailable",
    "fixture=isolated",
  ].join(" "),
);
