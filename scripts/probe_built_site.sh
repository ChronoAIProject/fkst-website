#!/usr/bin/env bash
# Serve the built static site locally and run the deployed-site probe against it.
# This is the deploy acceptance gate run against the exact artifact production
# will publish: it is invoked pre-merge (ci.yml, on every PR) and pre-deploy
# (pages.yml, before upload), so a build that drops a manifest page fails
# BEFORE the artifact is ever published — not only on the post-deploy probe.
# Reuses probe_site.sh (single source of probe truth) via a local HTTP server.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="${1:-${ROOT}/site/_site}"
PORT="${FKST_SITE_PROBE_PORT:-8099}"

if [ ! -d "$SITE_DIR" ]; then
  echo "fkst-website dept=probe-built tag=fail reason=missing-site-dir dir=$SITE_DIR" >&2
  exit 1
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$SITE_DIR" >/dev/null 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT

for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/" 2>/dev/null; then
    break
  fi
  sleep 0.3
done

FKST_SITE_PROBE_BASE_URL="http://127.0.0.1:${PORT}" "${ROOT}/scripts/probe_site.sh"
