# fkst-website

The third repo (library C) of the fkst ecosystem: a website-domain Lua package library running on the **fkst-substrate** engine. It builds on the packages of [fkst-packages](https://github.com/ChronoAIProject/fkst-packages) (library B) through composition and only carries the website-domain behavior layer.

This repo is **English-primary, zh-en bilingual**: source files are English; external artifacts (docs, issues, PRs) are English-first with Chinese as a secondary layer; the site itself is English-first with a Chinese version.

Official site: https://chronoaiproject.github.io/fkst-website/

## Repository Role And Extension Model

This repo follows the same engine-package contract as `fkst-packages`; the authoritative contract is `docs/package-repo-contract.md` in `fkst-substrate`. Reuse of library B packages follows three explicit extension levels, from least invasive to most invasive:

| Level | Mechanism | Status |
|---|---|---|
| 1. Tap | This repo's packages additionally consume a library B package queue through `pkg.queue` fanout. The original flow is unchanged. | Supported by the engine. |
| 2. Adapter wiring | A composed package wires a library B output port through this repo's adapter department and then to downstream consumers. | Supported by the engine. |
| 3. Static rebind declaration | A base package declares an edge as rebindable, and a composed package statically rewires that edge. | Not available. Propose it in `fkst-substrate` only after real cases cannot be expressed with level 2. |

Runtime interception is not part of this repo's model. Any inserted intermediate step must be a first-class explicit department with its own spec, deduplication rule, and `source_ref` discipline so graph scans can see it. Transparent wiring, where A and B do not know each other, is a design goal; transparent delivery semantics, where provenance, idempotency, and retry behavior remain unchanged, is not assumed.

Cross-repo references to library B packages are expressed by pinning the `fkst-packages` git ref and passing its package directories as additional `--package-root` entries during supervision. The engine treats multi-root package unions as a first-class capability.

## Website Source

The hand-authored static site lives under `site/` and is built with Eleventy:

- `site/package.json` defines `npm run build` as `eleventy` and `npm run dev` as `eleventy --serve`.
- `site/eleventy.config.js` uses `site/src` as the input directory, `site/src/_includes` for layouts and components, and `site/_site` as the output directory.
- Top-level English pages live in `site/src/*.njk`.
- Chinese pages live in `site/src/zh/*.njk`.
- Shared data modules live in `site/src/_data/`.
- Layouts, components, and template utilities live in `site/src/_includes/`.
- Static assets live in `site/src/assets/` and are copied to `assets/` by Eleventy passthrough copy.
- `site/probe-manifest` is copied by Eleventy passthrough copy for the read-only live probe.

There is no `site/public/` directory in the current tree.

## Packages

- `.fkst/local-packages/site-board/` (composed): site data source v0. A cron poll reads `FKST_GITHUB_REPO` open issues and open PRs, then builds the `fkst.site.board.v1` snapshot JSON. The output directory comes from `FKST_SITE_OUT`, defaults to `build/fkst/data`, and receives atomic `fkst.site.board.v1.json` and `manifest.json` writes through tmp-file rename. It never writes to hand-authored `site/`. After GitHub Pages deploy, the read-only live probe reads `site/probe-manifest` and only emits grep-friendly `PROBE` ok/fail/skip logs.

This repo is website-source-primary, so its own Lua packages are committed under `.fkst/local-packages/`. Cross-repo package roots are listed in `.fkst/compose/package-roots`, and `fkst.workspace.toml` names local packages, local libraries, and the `fkst-packages-platform` external source.

## Build And Test

```sh
cp env.example .env
# Set BIN=<fkst-substrate>/target/debug/fkst-framework in .env.

scripts/run.sh test-affected
scripts/run.sh test
scripts/run.sh check
```

`scripts/run.sh test-affected` runs the current affected-test path for local iteration, which includes the Eleventy build and site smoke checks. `scripts/run.sh test` delegates to the pinned `fkst-packages` host runner for package tests and composed conformance. `scripts/run.sh check` runs the shared source ratchets, engine host conformance, and the website probe test.

CI checks out and builds the `fkst-substrate` source pinned by `.fkst-substrate-ref`, hydrates the `fkst-packages` platform source pinned by `fkst.lock`, then runs `scripts/run.sh check` and `scripts/run.sh test`.

## Shared Conformance

This repo does not carry a local `scripts/check_repo.py` copy. Source ratchets come from a `ChronoAIProject/fkst-packages` checkout pinned by `fkst.lock`:

- The fkst-substrate source pin remains `.fkst-substrate-ref`.
- The fkst-packages platform pin is `fkst.lock` `external_source(id=fkst-packages-platform).resolved.rev`.
- Host conformance config lives under `.fkst/conformance/`.
- Host allowlists live under `.fkst/conformance/allowlists/`.
- Engine package roots are listed in `.fkst/compose/package-roots`.
- The hydrated checkout lives under `.fkst/run/fkst-packages-platform/`, which is ignored by git.

There is no separate per-repo dot-conformance directory and no copied ratchet infrastructure in this repo.

To bump the shared ratchets, update `fkst.workspace.toml` `external_source(id=fkst-packages-platform).rev` to the new full `fkst-packages` commit SHA, verify that SHA exists on the intended upstream branch, regenerate `fkst.lock` with `fkst-framework deps lock`, remove `.fkst/run/fkst-packages-platform/`, then run `scripts/run.sh check` and `scripts/run.sh test`.

## Repository Conventions

This repo follows the `fkst-packages` integration model: the default integration branch is `dev`, pull requests are squash-merged, source files use English internally, and external project artifacts are English-first. Event payloads only carry `source_ref` plus small control fields; large content stays out of payloads and consumers fetch it from the source. `site-board` generated artifacts only write under `FKST_SITE_OUT`, which defaults to `build/fkst/data`, and never write to hand-authored `site/`.

⟦AI:FKST⟧
