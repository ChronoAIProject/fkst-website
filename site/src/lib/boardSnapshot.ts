import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export const BOARD_SNAPSHOT_FILENAME = "fkst.site.board.v1.json";
export const BOARD_SCHEMA_VERSION = "fkst.site.board.v1";

export interface BoardItem {
  labels: unknown[];
  number: number;
  state: string;
  title: string;
  updatedAt: string;
  url: string;
}

export interface BoardSnapshot {
  issues: BoardItem[];
  prs: BoardItem[];
  repo: string;
  schema_version: typeof BOARD_SCHEMA_VERSION;
}

export interface BoardStatusRow {
  identifier: string;
  kind: "Issue" | "PR";
  labelCount: number;
  state: string;
  title: string;
  updatedAt: string;
  url: string;
}

export interface LoadedBoardSnapshot {
  counts: {
    issues: number;
    items: number;
    prs: number;
  };
  rows: BoardStatusRow[];
  snapshot: BoardSnapshot;
  sourcePath: string;
}

const SITE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SITE_ROOT, "..");
const GENERATED_BOARD_PATH = path.join(
  REPO_ROOT,
  "build",
  "fkst",
  "data",
  BOARD_SNAPSHOT_FILENAME,
);
const FIXTURE_BOARD_PATH = path.join(SITE_ROOT, "fixtures", BOARD_SNAPSHOT_FILENAME);

function resolveConfiguredPath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(SITE_ROOT, value);
}

function boardPathCandidates(): string[] {
  const configured = process.env.FKST_SITE_BOARD_SNAPSHOT;
  if (configured && configured.trim() !== "") {
    return [resolveConfiguredPath(configured)];
  }
  return [GENERATED_BOARD_PATH, FIXTURE_BOARD_PATH];
}

async function canReadFile(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return false;
    }
    throw error;
  }
}

async function resolveBoardSnapshotPath(): Promise<string> {
  const candidates = boardPathCandidates();
  for (const candidate of candidates) {
    if (await canReadFile(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Missing ${BOARD_SNAPSHOT_FILENAME}; set FKST_SITE_BOARD_SNAPSHOT or generate ${GENERATED_BOARD_PATH}.`,
  );
}

function requireObject(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, context: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    !Number.isFinite(value)
  ) {
    throw new Error(`${context} must be a positive integer.`);
  }
  return value;
}

function requireArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }
  return value;
}

function parseBoardItem(value: unknown, context: string): BoardItem {
  const item = requireObject(value, context);
  return {
    labels: requireArray(item.labels, `${context}.labels`),
    number: requirePositiveInteger(item.number, `${context}.number`),
    state: requireString(item.state, `${context}.state`),
    title: requireString(item.title, `${context}.title`),
    updatedAt: requireString(item.updatedAt, `${context}.updatedAt`),
    url: requireString(item.url, `${context}.url`),
  };
}

function parseBoardItemList(value: unknown, context: string): BoardItem[] {
  return requireArray(value, context).map((item, index) =>
    parseBoardItem(item, `${context}[${index}]`),
  );
}

function parseBoardSnapshot(value: unknown): BoardSnapshot {
  const snapshot = requireObject(value, "board snapshot");
  const schemaVersion = requireString(snapshot.schema_version, "board snapshot.schema_version");
  if (schemaVersion !== BOARD_SCHEMA_VERSION) {
    throw new Error(`board snapshot.schema_version must be ${BOARD_SCHEMA_VERSION}.`);
  }
  return {
    issues: parseBoardItemList(snapshot.issues, "board snapshot.issues"),
    prs: parseBoardItemList(snapshot.prs, "board snapshot.prs"),
    repo: requireString(snapshot.repo, "board snapshot.repo"),
    schema_version: BOARD_SCHEMA_VERSION,
  };
}

function rowFromItem(
  repo: string,
  kind: BoardStatusRow["kind"],
  item: BoardItem,
): BoardStatusRow {
  return {
    identifier: `${repo}#${item.number}`,
    kind,
    labelCount: item.labels.length,
    state: item.state,
    title: item.title,
    updatedAt: item.updatedAt,
    url: item.url,
  };
}

export async function loadBoardSnapshot(): Promise<LoadedBoardSnapshot> {
  const sourcePath = await resolveBoardSnapshotPath();
  const raw = await readFile(sourcePath, "utf-8");
  const snapshot = parseBoardSnapshot(JSON.parse(raw));
  const rows = [
    ...snapshot.issues.map((item) => rowFromItem(snapshot.repo, "Issue", item)),
    ...snapshot.prs.map((item) => rowFromItem(snapshot.repo, "PR", item)),
  ];

  return {
    counts: {
      issues: snapshot.issues.length,
      items: rows.length,
      prs: snapshot.prs.length,
    },
    rows,
    snapshot,
    sourcePath,
  };
}
