import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadBoardSnapshot } from "../src/data/site-board.mjs";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const board = loadBoardSnapshot();
assert.ok(board.items.length > 0, "board snapshot must contain at least one item");

const item = board.items[0];
const htmlPath = existsSync(resolve(siteRoot, "_site/status/index.html"))
  ? resolve(siteRoot, "_site/status/index.html")
  : resolve(siteRoot, "_site/status.html");
const html = await readFile(htmlPath, "utf-8");

for (const expected of [
  board.repo,
  item.title,
  item.state,
  String(item.number),
  String(board.items.filter((entry) => entry.kind === "Issue").length),
]) {
  assert.ok(
    html.includes(expected),
    `expected built /status HTML to include snapshot value: ${expected}`,
  );
}

console.log("fkst-website dept=status tag=ok STATUS_SMOKE rows=1");
