import { readFile } from "node:fs/promises";

const fixtureUrl = new URL(
  "../src/data/fixtures/fkst.site.board.v1.json",
  import.meta.url,
);
const statusHtmlUrl = new URL("../_site/status/index.html", import.meta.url);

function assertIncludes(html, expected, description) {
  if (!html.includes(expected)) {
    throw new Error(`status page missing ${description}: ${expected}`);
  }
}

const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const html = await readFile(statusHtmlUrl, "utf8");
const firstIssue = fixture.issues[0];

assertIncludes(html, fixture.schema_version, "schema version");
assertIncludes(html, fixture.repo, "repository name");
assertIncludes(html, `#${firstIssue.number}`, "first issue number");
assertIncludes(html, firstIssue.title, "first issue title");
assertIncludes(html, firstIssue.updatedAt, "first issue update timestamp");
assertIncludes(html, firstIssue.url, "first issue URL");

console.log(
  [
    "fkst-website",
    "dept=status",
    "tag=ok",
    `fixture=${fixture.schema_version}`,
    `repo=${fixture.repo}`,
    `first_issue=${firstIssue.number}`,
  ].join(" "),
);
