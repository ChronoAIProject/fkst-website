#!/usr/bin/env bash
# Probe the deployed GitHub Pages site from the tracked manifest.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="${FKST_SITE_PROBE_MANIFEST:-$ROOT/site/probe-manifest}"
BASE_URL="${FKST_SITE_PROBE_BASE_URL:-https://chronoaiproject.github.io/fkst-website}"
TIMEOUT_SECONDS="${FKST_SITE_PROBE_TIMEOUT_SECONDS:-15}"
CONNECT_TIMEOUT_SECONDS="${FKST_SITE_PROBE_CONNECT_TIMEOUT_SECONDS:-5}"

checked=0
failures=0
network_errors=0
results=()

while IFS= read -r path || [ -n "$path" ]; do
  path="${path%%#*}"
  path="${path#"${path%%[![:space:]]*}"}"
  path="${path%"${path##*[![:space:]]}"}"
  [ -n "$path" ] || continue

  checked=$((checked + 1))
  url="${BASE_URL}${path}"
  code="$(curl -sL -o /dev/null -w '%{http_code}' --connect-timeout "$CONNECT_TIMEOUT_SECONDS" --max-time "$TIMEOUT_SECONDS" -- "$url")" || code="error"
  [ -n "$code" ] || code="error"
  results+=("${path}:${code}")

  if [ "$code" = "200" ]; then
    continue
  elif [ "$code" = "error" ]; then
    network_errors=$((network_errors + 1))
  else
    failures=$((failures + 1))
  fi
done < "$MANIFEST"

joined="$(IFS=,; echo "${results[*]}")"
if [ "$checked" -eq 0 ]; then
  echo "fkst-website dept=pages tag=skip PROBE paths=0 reason=empty-manifest results="
elif [ "$network_errors" -eq "$checked" ]; then
  echo "fkst-website dept=pages tag=skip PROBE paths=$checked reason=all-paths-network-error results=$joined"
elif [ "$failures" -gt 0 ] || [ "$network_errors" -gt 0 ]; then
  echo "fkst-website dept=pages tag=fail PROBE paths=$checked failures=$failures network_errors=$network_errors results=$joined"
  exit 1
else
  echo "fkst-website dept=pages tag=ok PROBE paths=$checked results=$joined"
fi
