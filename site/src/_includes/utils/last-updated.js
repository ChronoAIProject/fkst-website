"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FALLBACK_DATE = "1970-01-01";

const gitDateCache = new Map();

function isValidDateOnly(value) {
  if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return isValidDateOnly(trimmed) ? trimmed : null;
}

function lastUpdatedMetadata(value) {
  const date = normalizeDateOnly(value);
  if (!date) {
    return null;
  }

  return {
    datetime: date,
    label: date,
  };
}

function runGit(repoRoot, args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (_error) {
    return "";
  }
}

function resolveRepositoryRoot(siteRoot) {
  const candidate = path.resolve(siteRoot, "..");
  const root = runGit(candidate, ["rev-parse", "--show-toplevel"]);
  return root ? path.resolve(root) : candidate;
}

function resolveInputPath(inputPath, siteRoot) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    return null;
  }

  const normalizedInputPath = inputPath.replace(/^\.\//, "");
  const absolutePath = path.isAbsolute(normalizedInputPath)
    ? normalizedInputPath
    : path.resolve(siteRoot, normalizedInputPath);

  return path.normalize(absolutePath);
}

function gitLastUpdatedDate(inputPath, options = {}) {
  const siteRoot = path.resolve(options.siteRoot || process.cwd());
  const repoRoot = path.resolve(options.repoRoot || resolveRepositoryRoot(siteRoot));
  const absolutePath = resolveInputPath(inputPath, siteRoot);
  if (!absolutePath) {
    return null;
  }

  const cacheKey = `${repoRoot}\0${absolutePath}`;
  if (gitDateCache.has(cacheKey)) {
    return gitDateCache.get(cacheKey);
  }

  const repositoryPath = path.relative(repoRoot, absolutePath);
  let date = null;
  if (
    repositoryPath &&
    !repositoryPath.startsWith("..") &&
    repositoryPath !== "." &&
    fs.existsSync(absolutePath)
  ) {
    date = normalizeDateOnly(
      runGit(repoRoot, ["log", "-1", "--format=%cs", "--", repositoryPath])
        .split(/\r?\n/)
        .find(Boolean) || ""
    );
  }

  gitDateCache.set(cacheKey, date);
  return date;
}

function lastUpdatedForInputPath(inputPath, options = {}) {
  return gitLastUpdatedDate(inputPath, options) || FALLBACK_DATE;
}

function pageLastUpdated(data, options = {}) {
  return lastUpdatedForInputPath(data && data.page && data.page.inputPath, options);
}

module.exports = {
  FALLBACK_DATE,
  isValidDateOnly,
  lastUpdatedForInputPath,
  lastUpdatedMetadata,
  normalizeDateOnly,
  pageLastUpdated,
};
