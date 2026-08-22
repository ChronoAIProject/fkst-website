#!/usr/bin/env bash
# This repository's own gate: build the site, then prove every page in the manifest is servable.
#
# It exists as one invocation because a caller that wants to know "is this repository healthy"
# should not have to know the steps. The steps are this repository's business; the answer is not.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/site"
npm ci --no-audit --no-fund
npm run build
cd "$ROOT"
bash scripts/probe_built_site.sh site/_site
