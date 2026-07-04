"use strict";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric"
});

// Audit for #127/#134: the local issue bundle names prior #76/#84 same-class
// work, but checked-in source has no reusable last-updated module, filter,
// front-matter contract, footer render path, or smoke check. This utility is
// the canonical scaffold surface for the shared footer metadata contract.
function dateOnlyFromParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function dateOnlyFromValue(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== "string") {
    return null;
  }

  const candidate = value.trim();
  const match = candidate.match(DATE_ONLY_PATTERN);
  if (match) {
    return dateOnlyFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function formatDateOnly(dateOnly) {
  return DATE_FORMATTER.format(new Date(`${dateOnly}T00:00:00.000Z`));
}

function metadataDateValue(value) {
  if (!value || value instanceof Date || typeof value !== "object") {
    return value;
  }

  return value.date ?? value.iso ?? value.datetime;
}

function metadataLabel(value) {
  if (!value || value instanceof Date || typeof value !== "object") {
    return "";
  }

  return typeof value.label === "string" ? value.label.trim() : "";
}

function lastUpdatedMetadata(value) {
  const dateOnly = dateOnlyFromValue(metadataDateValue(value));
  if (!dateOnly) {
    return null;
  }

  return {
    datetime: dateOnly,
    label: metadataLabel(value) || formatDateOnly(dateOnly)
  };
}

module.exports = {
  dateOnlyFromValue,
  lastUpdatedMetadata
};
