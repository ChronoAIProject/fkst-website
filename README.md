# fkst-website

The public fkst website: a normal Astro static-site project under `site/`.

This repository builds and serves the site and nothing else. It holds no build
tooling, configuration, or code belonging to the system it is about — the board
snapshot it renders arrives as a plain JSON file, and how that file is produced
is not this repository's concern.

This repo is **English-primary, zh-en bilingual**: source files are English;
external artifacts such as docs, issues, and PRs are English-first with Chinese
as a secondary layer; the site itself is English-first with a Chinese version.

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

## Data inputs

`site/src/data/fixtures/fkst.site.board.v1.json` is a committed fixture of the
board snapshot, so the site builds and its tests run with no external input at
all. When a real snapshot is dropped under `build/`, the same schema applies —
`site/src/data/site-board.mjs` validates every field it reads and fails the build
on a malformed one.

## Conventions

Source files are English; outward artifacts are English-primary with Chinese
only as an optional secondary layer. Page generation is Astro's: the site is
built from the Markdown and components in `site/`, plus whatever data files are
present under `build/`, and never from a process running inside this repository.
Hand-authored content under `site/` is never machine-written. The
integration/default branch is `dev`; PRs are squash merged.

⟦AI:FKST⟧
