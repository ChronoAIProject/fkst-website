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

is_broad_affected_path() {
  local path="$1"
  case "$path" in
    scripts/run.sh)
      return 1
      ;;
    scripts/*|site/*|.github/*|fkst.workspace.toml|fkst.lock|*.toml|*.lock|*.json|*.yml|*.yaml)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

resolve_host_bin() {
  # shellcheck source=/dev/null
  . "$shared/scripts/bin_bootstrap.sh"
  if ! resolve_bin_contract "$ROOT" "bootstrap"; then
    echo "error: $RESOLVE_BIN_ERROR" >&2
    return 1
  fi
  BIN="$RESOLVED_BIN"
  export BIN
}

local_package_is_composed() {
  python3 - "$1/fkst.toml" <<'PY'
import sys
import tomllib
from pathlib import Path

manifest = Path(sys.argv[1])
try:
    data = tomllib.loads(manifest.read_text(encoding="utf-8"))
except (FileNotFoundError, tomllib.TOMLDecodeError) as exc:
    print(f"error: failed to read package manifest: {manifest}: {exc}", file=sys.stderr)
    raise SystemExit(2)

raise SystemExit(0 if data.get("kind") == "package.composed" else 1)
PY
}

cmd_test_package_only() {
  local package="$1" package_root="$LOCAL_PACKAGES/$package" runtime_root durable_root status=0 composed_status=0
  [ -d "$package_root" ] || { echo "error: affected package does not exist: $package" >&2; return 1; }
  resolve_host_bin || return 1

  runtime_root="$(mktemp -d "${TMPDIR:-/tmp}/fkst-host-test-rt.XXXXXX")"
  durable_root="$(mktemp -d "${TMPDIR:-/tmp}/fkst-host-test-durable.XXXXXX")"
  (
    export FKST_RUNTIME_ROOT="$runtime_root"
    export FKST_DURABLE_ROOT="$durable_root"
    unset FKST_GITHUB_WRITE
    unset FKST_SUPERVISOR_PID

    echo "host test hermetic: FKST_RUNTIME_ROOT=$FKST_RUNTIME_ROOT FKST_DURABLE_ROOT=$FKST_DURABLE_ROOT"
    echo "=== self-test ==="
    "$BIN" --self-test

    echo "=== $package ==="
    set +e
    local_package_is_composed "$package_root"
    composed_status=$?
    set -e
    case "$composed_status" in
      0)
        echo "skip single-package conformance for composed package: $package"
        ;;
      1)
        "$BIN" conformance --project-root "$package_root" --package-root "$package_root"
        ;;
      *)
        exit "$composed_status"
        ;;
    esac
    "$BIN" test --project-root "$ROOT" --package-root "$package_root"
  ) || status=$?
  rm -rf "$runtime_root" "$durable_root"
  return "$status"
}

cmd_test_affected() {
  local changed_file path package packages="" full=0 status=0
  changed_file="$(mktemp "${TMPDIR:-/tmp}/fkst-website-test-affected.XXXXXX")"
  {
    git -C "$ROOT" diff --name-only HEAD
    git -C "$ROOT" ls-files --others --exclude-standard
  } | sed '/^$/d' | LC_ALL=C sort -u > "$changed_file"

  while IFS= read -r path || [ -n "$path" ]; do
    [ -n "$path" ] || continue
    if is_broad_affected_path "$path"; then
      full=1
    fi
    case "$path" in
      .fkst/local-packages/*/*)
        package="${path#".fkst/local-packages/"}"
        package="${package%%/*}"
        case " $packages " in
          *" $package "*) ;;
          *) packages="$packages $package" ;;
        esac
        ;;
      .fkst/local-libraries/*)
        full=1
        ;;
      .fkst/compose/*|.fkst/conformance/*)
        full=1
        ;;
    esac
  done < "$changed_file"
  rm -f "$changed_file"

  if [ "$full" -eq 1 ] || [ -z "${packages# }" ]; then
    shared_host_run test
    return $?
  fi

  for package in $packages; do
    if ! cmd_test_package_only "$package"; then
      status=1
    fi
  done
  return "$status"
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
  test-affected) shift; cmd_test_affected "$@" ;;
  test|supervise) exec "$shared/scripts/run.sh" host \
    --host-root "$ROOT" \
    --local-packages "$LOCAL_PACKAGES" \
    -- "$@" ;;
esac
