import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const BOARD_SCHEMA_VERSION = "fkst.site.board.v1";
export const BOARD_FILENAME = "fkst.site.board.v1.json";
export const DEFAULT_SITE_OUT = "build/fkst/data";

function findSiteRoot() {
  if (process.env.FKST_WEBSITE_SITE_ROOT) {
    return resolve(process.env.FKST_WEBSITE_SITE_ROOT);
  }

  const cwd = process.cwd();
  if (existsSync(resolve(cwd, "src/data/fixtures", BOARD_FILENAME))) {
    return cwd;
  }
  if (existsSync(resolve(cwd, "site/src/data/fixtures", BOARD_FILENAME))) {
    return resolve(cwd, "site");
  }
  return cwd;
}

const siteRoot = findSiteRoot();
const repoRoot = resolve(siteRoot, "..");
const fixturePath = resolve(siteRoot, "src/data/fixtures", BOARD_FILENAME);

function normaliseSiteOut(value) {
  const raw = typeof value === "string" && value.length > 0 ? value : DEFAULT_SITE_OUT;
  if (raw.includes("\0") || raw.includes("\n") || raw.includes("\r")) {
    throw new Error("FKST_SITE_OUT contains an invalid path character");
  }
  return raw.replace(/\/+$/, "") || "/";
}

export function boardSnapshotPathFromSiteOut(siteOut = process.env.FKST_SITE_OUT) {
  return resolve(repoRoot, normaliseSiteOut(siteOut), BOARD_FILENAME);
}

function isBoardItem(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Number.isInteger(value.number) &&
    value.number > 0 &&
    typeof value.title === "string" &&
    typeof value.state === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.url === "string" &&
    Array.isArray(value.labels)
  );
}

export function parseBoardSnapshot(raw, sourcePath) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Board snapshot is not valid JSON at ${sourcePath}: ${error.message}`);
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Board snapshot must be an object at ${sourcePath}`);
  }
  if (value.schema_version !== BOARD_SCHEMA_VERSION) {
    throw new Error(`Board snapshot schema_version must be ${BOARD_SCHEMA_VERSION}`);
  }
  if (typeof value.repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(value.repo)) {
    throw new Error("Board snapshot repo must be owner/name");
  }
  if (!Array.isArray(value.issues) || !Array.isArray(value.prs)) {
    throw new Error("Board snapshot issues and prs must be arrays");
  }

  const issues = value.issues.map((item, index) => {
    if (!isBoardItem(item)) {
      throw new Error(`Board snapshot issue ${index + 1} is invalid`);
    }
    return { ...item, kind: "Issue" };
  });
  const prs = value.prs.map((item, index) => {
    if (!isBoardItem(item)) {
      throw new Error(`Board snapshot pr ${index + 1} is invalid`);
    }
    return { ...item, kind: "PR" };
  });

  return {
    repo: value.repo,
    items: [...issues, ...prs],
    sourcePath,
  };
}

export function loadBoardSnapshot(options = {}) {
  const snapshotPath = options.snapshotPath ?? boardSnapshotPathFromSiteOut(options.siteOut);
  const sourcePath = existsSync(snapshotPath) ? snapshotPath : fixturePath;
  const raw = readFileSync(sourcePath, "utf-8");
  return parseBoardSnapshot(raw, sourcePath);
}
