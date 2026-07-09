import boardSnapshot from "./fixtures/fkst.site.board.v1.json";

const BOARD_SCHEMA_VERSION = "fkst.site.board.v1";

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
  if (snapshot.schema_version !== BOARD_SCHEMA_VERSION) {
    throw new Error(
      `site-board snapshot schema_version must be ${BOARD_SCHEMA_VERSION}`,
    );
  }

  return {
    schemaVersion: snapshot.schema_version,
    repo: assertString(snapshot.repo, "site-board snapshot.repo"),
    issues: normaliseRows(snapshot.issues, "issues"),
    prs: normaliseRows(snapshot.prs, "prs"),
  };
}

const siteBoardSnapshot = normaliseSnapshot(boardSnapshot);

export function getSiteBoardSnapshot() {
  return siteBoardSnapshot;
}

export function getSiteBoardRows(snapshot = siteBoardSnapshot) {
  return [...snapshot.issues, ...snapshot.prs];
}
