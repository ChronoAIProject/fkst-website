import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const SITE_BOARD_SCHEMA_VERSION = "fkst.site.board.v1";
export const SITE_BOARD_FILENAME = "fkst.site.board.v1.json";

const DEFAULT_SITE_OUT = "build/fkst/data";
const SITE_ROOT = resolve(process.cwd());
const REPOSITORY_ROOT = resolve(SITE_ROOT, "..");

function assertObject(value, context) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
}

function assertString(value, context) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value;
}

function assertPositiveInteger(value, context) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${context} must be a positive integer`);
  }
  return value;
}

function normaliseLabel(label, context) {
  if (typeof label === "string") {
    return { name: assertString(label, context) };
  }
  assertObject(label, context);
  return { name: assertString(label.name, `${context}.name`) };
}

function normaliseRow(row, kind, index) {
  const context = `${kind}[${index}]`;
  assertObject(row, context);
  const labels = Array.isArray(row.labels)
    ? row.labels.map((label, labelIndex) =>
        normaliseLabel(label, `${context}.labels[${labelIndex}]`),
      )
    : (() => {
        throw new Error(`${context}.labels must be an array`);
      })();

  return {
    kind,
    number: assertPositiveInteger(row.number, `${context}.number`),
    title: assertString(row.title, `${context}.title`),
    state: assertString(row.state, `${context}.state`),
    labels,
    updatedAt: assertString(row.updatedAt, `${context}.updatedAt`),
    url: assertString(row.url, `${context}.url`),
  };
}

function normaliseRows(rows, kind) {
  if (!Array.isArray(rows)) {
    throw new Error(`${kind} must be an array`);
  }
  return rows.map((row, index) => normaliseRow(row, kind, index));
}

function normaliseSnapshot(snapshot) {
  assertObject(snapshot, "site-board snapshot");
  if (snapshot.schema_version !== SITE_BOARD_SCHEMA_VERSION) {
    throw new Error(
      `site-board snapshot schema_version must be ${SITE_BOARD_SCHEMA_VERSION}`,
    );
  }

  return {
    schemaVersion: snapshot.schema_version,
    repo: assertString(snapshot.repo, "site-board snapshot.repo"),
    issues: normaliseRows(snapshot.issues, "issues"),
    prs: normaliseRows(snapshot.prs, "prs"),
  };
}

function isInsideSiteRoot(path) {
  const relation = relative(SITE_ROOT, path);
  return (
    relation === "" ||
    (!isAbsolute(relation) && relation !== ".." && !relation.startsWith(`..${sep}`))
  );
}

function unavailable(reason) {
  return { status: "unavailable", reason };
}

function configuredSnapshotPath(siteOut) {
  const outputDirectory = siteOut === undefined || siteOut === ""
    ? DEFAULT_SITE_OUT
    : siteOut;
  if (typeof outputDirectory !== "string") {
    throw new TypeError("FKST_SITE_OUT must be a path string");
  }
  return resolve(REPOSITORY_ROOT, outputDirectory, SITE_BOARD_FILENAME);
}

async function readSnapshotInput(snapshotPath) {
  if (isInsideSiteRoot(snapshotPath)) {
    return null;
  }

  let file;
  try {
    const canonicalPath = await realpath(snapshotPath);
    if (isInsideSiteRoot(canonicalPath)) {
      return null;
    }

    file = await open(canonicalPath, "r");
    const metadata = await file.stat();
    if (!metadata.isFile() || !Number.isFinite(metadata.mtimeMs)) {
      return null;
    }

    return {
      generatedAt: metadata.mtime.toISOString(),
      raw: await file.readFile("utf8"),
    };
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => {});
  }
}

export async function loadSiteBoardSnapshot({
  siteOut = process.env.FKST_SITE_OUT,
} = {}) {
  let snapshotPath;
  try {
    snapshotPath = configuredSnapshotPath(siteOut);
  } catch {
    return unavailable("configuration");
  }

  const input = await readSnapshotInput(snapshotPath);
  if (input === null) {
    return unavailable("input");
  }

  let document;
  try {
    document = JSON.parse(input.raw);
  } catch {
    return unavailable("json");
  }

  let snapshot;
  try {
    snapshot = normaliseSnapshot(document);
  } catch {
    return unavailable("validation");
  }

  return {
    status: "available",
    snapshot,
    provenance: {
      generatedAt: input.generatedAt,
      source: `GitHub open issues and pull requests for ${snapshot.repo}`,
    },
  };
}

export function getSiteBoardRows(snapshot) {
  return [...snapshot.issues, ...snapshot.prs];
}
