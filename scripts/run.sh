#!/usr/bin/env bash
# Thin host bootstrapper for fkst-website.
#
# This repo owns only the host glue: hydrate the pinned fkst-packages checkout,
# keep website-owned checks local, then delegate shared fkst orchestration to
# the public host entrypoint.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="$ROOT/fkst.lock"
CHECKOUT="$ROOT/.fkst/run/fkst-packages-platform"
REPO_URL="https://github.com/ChronoAIProject/fkst-packages.git"
LOCAL_PACKAGES="$ROOT/.fkst/local-packages"

read_fkst_packages_pin_from_lock() {
  python3 - "$LOCK_FILE" <<'PY'
import re
import sys
import tomllib
from pathlib import Path

lock_path = Path(sys.argv[1])
try:
    data = tomllib.loads(lock_path.read_text(encoding="utf-8"))
except FileNotFoundError:
    print(f"error: missing fkst lockfile: {lock_path}", file=sys.stderr)
    raise SystemExit(1)
except tomllib.TOMLDecodeError as exc:
    print(f"error: invalid fkst lockfile: {lock_path}: {exc}", file=sys.stderr)
    raise SystemExit(1)

sources = data.get("external_source", [])
if isinstance(sources, dict):
    sources = [sources]

for source in sources:
    if source.get("id") == "fkst-packages-platform":
        rev = source.get("resolved", {}).get("rev")
        if not isinstance(rev, str) or not re.fullmatch(r"[0-9a-f]{40}", rev):
            print(
                "error: fkst.lock external_source(id=fkst-packages-platform) "
                "is missing resolved.rev as a full git SHA",
                file=sys.stderr,
            )
            raise SystemExit(1)
        print(rev)
        raise SystemExit(0)

print("error: fkst.lock is missing external_source(id=fkst-packages-platform)", file=sys.stderr)
raise SystemExit(1)
PY
}

ensure_fkst_packages_checkout() {
  local pin="$1" current
  if [ -n "${FKST_PACKAGES_RUNNER:-}" ]; then
    [ -d "$FKST_PACKAGES_RUNNER" ] || {
      echo "error: FKST_PACKAGES_RUNNER does not exist: $FKST_PACKAGES_RUNNER" >&2
      return 1
    }
    printf '%s\n' "$FKST_PACKAGES_RUNNER"
    return 0
  fi
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
usage: scripts/run.sh <check|test|test-affected|supervise> [args]

Hydrates the fkst.lock-resolved fkst-packages checkout, runs website-local checks for
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
  python3 -B "$ROOT/scripts/check_single_platform_pin.py"
  shared_host_run check
  echo "=== website probe_site_test.py ==="
  python3 -B "$ROOT/scripts/probe_site_test.py"
}

cmd_test() {
  shared_host_run test "$@"
  if [ "$#" -eq 0 ]; then
    echo "=== website status smoke ==="
    (cd "$ROOT/site" && npm run test:status)
  fi
}

changed_paths() {
  {
    git -C "$ROOT" diff --name-only HEAD
    git -C "$ROOT" ls-files --others --exclude-standard
  } | sed '/^[[:space:]]*$/d' | sort -u
}

cmd_test_affected() {
  local paths broad pkg packages
  paths="$(changed_paths)"
  if [ -z "$paths" ]; then
    echo "=== no changed paths; running full test ==="
    cmd_test
    return
  fi

  broad=0
  packages=""
  while IFS= read -r path; do
    case "$path" in
      .fkst/local-packages/*/*)
        pkg="${path#".fkst/local-packages/"}"
        pkg="${pkg%%/*}"
        case " $packages " in
          *" $pkg "*) ;;
          *) packages="$packages $pkg" ;;
        esac
        ;;
      *)
        broad=1
        ;;
    esac
  done <<EOF_PATHS
$paths
EOF_PATHS

  if [ "$broad" -eq 1 ]; then
    echo "=== broad changes detected; running full test ==="
    cmd_test
    return
  fi

  for pkg in $packages; do
    echo "=== package-only changes detected; running package test: $pkg ==="
    cmd_test "$pkg"
  done
}

case "${1:-}" in
  check|test|test-affected|supervise) ;;
  -h|--help|help|"") usage; exit 0 ;;
  *) echo "unknown subcommand: $1" >&2; usage >&2; exit 2 ;;
esac

pin="$(read_fkst_packages_pin_from_lock)"
shared="$(ensure_fkst_packages_checkout "$pin")"
[ -x "$shared/scripts/run.sh" ] || { echo "error: shared run.sh is not executable: $shared/scripts/run.sh" >&2; exit 1; }

case "$1" in
  check) shift; cmd_check "$@" ;;
  test) shift; cmd_test "$@" ;;
  test-affected) shift; cmd_test_affected "$@" ;;
  supervise) exec "$shared/scripts/run.sh" host \
    --host-root "$ROOT" \
    --local-packages "$LOCAL_PACKAGES" \
    -- "$@" ;;
esac
