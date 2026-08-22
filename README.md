# fkst-website

The public fkst website and the website-domain data packages that support it.
The website itself is a normal Astro static-site project under `site/` with no
fkst engine involvement in page generation. Website-domain Lua packages remain
under `.fkst/local-packages/` only for data artifacts such as the board snapshot.

This repo is **English-primary, zh-en bilingual**: source files are English;
external artifacts such as docs, issues, and PRs are English-first with Chinese
as a secondary layer; the site itself is English-first with a Chinese version.

This is fkst's third repository, repo C: a website-source-primary repo with
website-domain Lua packages that compose selected packages from repo B.

Official website: https://chronoaiproject.github.io/fkst-website/

## Website build

`site/` is an Astro project selected for static output, Markdown content,
documented i18n routing, and room for later data-driven pages through ordinary
build-time inputs. Source pages live in `site/src/pages/`, shared layouts live in
`site/src/layouts/`, Markdown content lives in `site/src/content/{en,zh}/`, and
static assets live in `site/public/`.

```sh
cd site
npm ci
npm run build
cd ..
bash scripts/probe_built_site.sh site/_site
```

The build artifact is `site/_site/` so the existing GitHub Pages upload and
`probe_site.sh` / `probe_built_site.sh` gates keep checking the deployed URL
contract. The tracked `site/probe-manifest` is the list of pages that must stay
servable.

## Repository Position And Extension Model

The runtime package side of this repo follows the same engine↔package contract
as fkst-packages (authority: fkst-substrate `docs/package-repo-contract.md`).
Reuse of repo B packages follows three extension levels, used from lowest to
highest impact and upgraded only when a real requirement needs the stronger
level:

| Level | Mechanism | Status |
|---|---|---|
| 1. Tap (side-channel observation) | A package in this repo additionally consumes a repo B package's `pkg.queue` through fanout multi-consumer delivery while leaving the original flow unchanged. | Supported by the engine. |
| 2. Adapter wiring | A composed package connects a repo B output port through this repo's adapter department to downstream departments, following the autochrono pattern. | Supported by the engine. |
| 3. Static rebind declaration | A base package declares an edge as rebindable, and a composed package statically rewires it. | Does not exist; propose it to fkst-substrate only after collecting real cases that level 2 cannot express. |

**No runtime interception**: inserted intermediate steps must be first-class,
explicit departments with their own `spec`, `dedup`, and `source_ref` discipline,
and they must be visible to graph scans. Wiring transparency, where A and B do
not need to know about each other, is a design goal. Delivery semantics
transparency, where provenance, idempotency, and retry behavior remain unchanged,
is not claimed if it cannot be preserved.

Cross-repo use of repo B packages means pinning the fkst-packages git ref and
passing the selected package directory as an additional `--package-root` during
supervision. Multi-package-root union is a first-class engine capability.

## Packages

- `.fkst/local-packages/site-board/` (composed): site data source v0. A cron poll reads `FKST_GITHUB_REPO` open issues and open PRs, then builds the `fkst.site.board.v1` snapshot JSON. The output directory comes from `FKST_SITE_OUT`, defaults to `build/fkst/data`, and receives atomic `fkst.site.board.v1.json` and `manifest.json` writes through tmp-file rename. It never writes to hand-authored `site/`. Astro can later consume these artifacts as ordinary build-time data inputs.

## Build And Test

```sh
cp env.example .env   # Set BIN=<fkst-substrate>/target/debug/fkst-framework
scripts/run.sh test   # self-test + conformance + all package tests
scripts/run.sh check  # pinned shared source ratchets + engine host conformance
```

The website-owned wrapper invokes the pinned `fkst-packages` source ratchet
directly, then uses the already-built `BIN` for engine self-test, conformance,
and package tests. Long-running supervision belongs to the deployment operator.

CI checks out the engine source from the `.fkst-substrate-ref` git source pin,
builds `fkst-framework`, then runs `scripts/run.sh check` and
`scripts/run.sh test`.

## Shared conformance

This repo does not carry a local `scripts/check_repo.py` copy. The website-owned
check wrapper invokes that ratchet from a `ChronoAIProject/fkst-packages`
checkout pinned by `fkst.lock`:

- The fkst-substrate source pin remains `.fkst-substrate-ref`.
- The fkst-packages platform pin is
  `fkst.lock` `external_source(id=fkst-packages-platform).resolved.rev`.
- Host conformance config lives under `.fkst/conformance/`.
- Host allowlists: `.fkst/conformance/allowlists/`
- Engine package roots: `.fkst/compose/package-roots`
- Hydrated checkout: `.fkst/run/fkst-packages-platform/` (ignored)

There is no separate per-repo dot-conformance directory and no copied ratchet
infrastructure in this repo.

To bump the shared ratchets, update `fkst.workspace.toml`
`external_source(id=fkst-packages-platform).rev` to the new full
fkst-packages commit SHA, verify that SHA exists on the intended upstream
branch, regenerate `fkst.lock` with `fkst-framework deps lock`, remove
`.fkst/run/fkst-packages-platform/`, then run `scripts/run.sh check` and
`scripts/run.sh test`.

## Conventions

The repo follows the same operating discipline as fkst-packages: source files
are English; outward artifacts are English-primary with Chinese only as an
optional secondary layer; event payloads carry only `source_ref` plus small
control fields, while consumers fetch large content from its source; `site-board`
artifacts write only to `FKST_SITE_OUT`, defaulting to `build/fkst/data`, and
never to hand-authored `site/`; site page generation stays in Astro, not FKST
engine departments; the integration/default branch is `dev`; PRs are squash
merged.

⟦AI:FKST⟧
