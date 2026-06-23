#!/usr/bin/env bash
# Thin host bootstrapper for fkst-website.
#
# This repo owns only the host glue: hydrate the pinned fkst-packages checkout,
# keep website-owned checks local, then delegate shared fkst orchestration to
# the public host entrypoint.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIN_FILE="$ROOT/.fkst-packages-ref"
CHECKOUT="$ROOT/.fkst/run/fkst-packages-conformance"
REPO_URL="https://github.com/ChronoAIProject/fkst-packages.git"
LOCAL_PACKAGES="$ROOT/.fkst/local-packages"

read_pin() {
  local pin
  [ -f "$PIN_FILE" ] || { echo "error: missing fkst-packages pin: $PIN_FILE" >&2; exit 1; }
  pin="$(sed -n '1p' "$PIN_FILE")"
  pin="${pin%%#*}"
  pin="${pin#"${pin%%[![:space:]]*}"}"
  pin="${pin%"${pin##*[![:space:]]}"}"
  if ! [[ "$pin" =~ ^[0-9a-f]{40}$ ]]; then
    echo "error: fkst-packages pin must be a full git SHA: $PIN_FILE" >&2
    exit 1
  fi
  printf '%s\n' "$pin"
}

ensure_fkst_packages_checkout() {
  local pin="$1" current
  if [ -d "$CHECKOUT/.git" ]; then
    current="$(git -C "$CHECKOUT" rev-parse HEAD 2>/dev/null || true)"
    if [ "$current" = "$pin" ]; then
      printf '%s\n' "$CHECKOUT"
      return 0
    fi
    rm -rf "$CHECKOUT"
  elif [ -e "$CHECKOUT" ]; then
    rm -rf "$CHECKOUT"
  fi

  mkdir -p "$(dirname "$CHECKOUT")"
  git clone --quiet --no-checkout "$REPO_URL" "$CHECKOUT"
  git -C "$CHECKOUT" checkout --quiet "$pin"
  printf '%s\n' "$CHECKOUT"
}

usage() {
  cat <<'EOF'
usage: scripts/run.sh <check|test|supervise> [args]

Hydrates the pinned fkst-packages checkout, runs website-local checks for
`check`, then delegates shared orchestration to:
  <fkst-packages>/scripts/run.sh host --host-root <this repo> --local-packages <this repo>/.fkst/local-packages -- <command>
EOF
}

shared_host_run() {
  "$shared/scripts/run.sh" host \
    --host-root "$ROOT" \
    --local-packages "$LOCAL_PACKAGES" \
    -- "$@"
}

cmd_check() {
  # The shared host check preserves the old no-BIN path: source ratchets run
  # before fkst-framework resolution. Keep website probe tests host-local.
  shared_host_run check
  echo "=== website probe_site_test.py ==="
  python3 -B "$ROOT/scripts/probe_site_test.py"
}

case "${1:-}" in
  check|test|supervise) ;;
  -h|--help|help|"") usage; exit 0 ;;
  *) echo "unknown subcommand: $1" >&2; usage >&2; exit 2 ;;
esac

pin="$(read_pin)"
shared="$(ensure_fkst_packages_checkout "$pin")"
[ -x "$shared/scripts/run.sh" ] || { echo "error: shared run.sh is not executable: $shared/scripts/run.sh" >&2; exit 1; }

case "$1" in
  check) shift; cmd_check "$@" ;;
  test|supervise) exec "$shared/scripts/run.sh" host \
    --host-root "$ROOT" \
    --local-packages "$LOCAL_PACKAGES" \
    -- "$@" ;;
esac
