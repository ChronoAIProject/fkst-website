# CLAUDE.md

## Working language

Source files are English throughout: comments, log/error text, template strings, and
identifiers in `.js`, `.mjs`, `.astro`, `.sh`, `.py` stay English. External artifacts of THIS
repo (docs, issues, PRs, comments, change notes) are **English-primary**; Chinese is welcome as
a secondary bilingual layer where it adds value, but the canonical text is English. Site content
is English-first with a Chinese version (zh-en bilingual). Do not mix languages mid-sentence;
code identifiers, paths, command names, and quoted originals stay English.

（中文摘要：本仓语言英文为主、中英双语；源文件全英文；对外产物以英文为准，中文为辅；站点英文优先、提供中文版。）

## What this repository is

The public fkst website, and only that: an Astro static-site project under `site/`, its own
build, its own deploy workflow, and its own probes.

It is a website about a system, not a part of that system. It carries no packages, no engine
pin, no runner, no conformance configuration, and no dependency on any other repository's
tooling. `npm ci && npm run build` in `site/` is the whole build, and it works on a machine that
has never heard of fkst.

That property is deliberate and worth keeping. If something here starts needing to know how the
system it describes is built, run, or deployed, that is a sign the thing belongs in the system's
own repositories instead — the operational layer in `fkst-ops`, its parameters in
`fkst-deployments`, website-domain packages in `fkst-website-packages`.

## Site data

The site renders a board snapshot. It reads it as an ordinary build-time data file:

- `site/src/data/fixtures/fkst.site.board.v1.json` is a committed fixture, so the build and its
  tests need no external input.
- `site/src/data/site-board.mjs` validates every field it reads and throws on a malformed one.
  A bad snapshot fails the build rather than rendering wrong.
- A produced snapshot arrives under `build/` (gitignored). Whatever writes it runs outside this
  repository, and nothing here needs to know what.

Hand-authored content under `site/` is never machine-written.

## Build and test

```sh
cd site && npm ci && npm run build     # artifact: site/_site/
cd .. && bash scripts/probe_built_site.sh site/_site
```

`site/probe-manifest` is the list of pages that must stay servable; `scripts/probe_site.sh`
checks the deployed URL contract. CI runs the build and the built-site probe; the Pages workflow
uploads `site/_site/`.

## Git

Integration/default branch is `dev`; never commit to it directly. Branch names are
`<type>/<kebab-topic>` (`feat|fix|docs|chore|refactor|test`). Commit subjects and PR titles are
English imperatives; PR bodies carry motivation, changes, and test evidence. CI green before
merge; squash merge to keep `dev` linear. AI-generated outward text ends with `⟦AI:FKST⟧`.

## Discipline

- One source file stays under 1000 lines. Hard limit.
- No deprecated shims, compat layers, `.old` or `_legacy`. Change a contract completely; the
  current state is the only state.
- Error classes stay narrow; log lines stay greppable.
- Content about fkst belongs here. Code, configuration, or tooling belonging to fkst does not.

⟦AI:FKST⟧
