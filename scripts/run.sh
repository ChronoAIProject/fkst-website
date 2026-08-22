#!/usr/bin/env bash
# Repository check and test entrypoint for fkst-website.
#
# This repo owns its test orchestration. The pinned fkst-packages checkout supplies
# source ratchets and composed package roots; the already-built engine supplies
# self-test, conformance, and package-test primitives.
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
usage: scripts/run.sh <check|test> [args]

Hydrates the fkst.lock-resolved fkst-packages checkout for shared source ratchets
and composed package roots. Test orchestration remains website-owned.
EOF
}

resolve_bin() {
  if [ -z "${BIN:-}" ] && [ -f "$ROOT/.env" ]; then
    # shellcheck disable=SC1091
    source "$ROOT/.env"
  fi
  [ -n "${BIN:-}" ] || {
    echo "error: BIN is required; set it in the environment or $ROOT/.env" >&2
    return 1
  }
  [ -x "$BIN" ] || {
    echo "error: BIN is not executable: $BIN" >&2
    return 1
  }
}

load_package_roots() {
  local roots_file="$ROOT/.fkst/compose/package-roots" raw line path root_count=0
  ENGINE_PACKAGE_ROOT_ARGS=()
  [ -f "$roots_file" ] || {
    echo "error: missing package-root declaration: $roots_file" >&2
    return 1
  }
  while IFS= read -r raw || [ -n "$raw" ]; do
    line="${raw%%#*}"
    line="$(printf '%s' "$line" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    [ -n "$line" ] || continue
    case "$line" in
      fkst-packages:*) path="$shared/${line#fkst-packages:}" ;;
      *) path="$ROOT/$line" ;;
    esac
    [ -d "$path" ] || {
      echo "error: configured package root does not exist: $path" >&2
      return 1
    }
    ENGINE_PACKAGE_ROOT_ARGS+=(--package-root "$path")
    root_count=$((root_count + 1))
  done < "$roots_file"
  [ "$root_count" -gt 0 ] || {
    echo "error: no package roots declared in $roots_file" >&2
    return 1
  }
}

run_source_ratchets() {
  local checker="$shared/scripts/check_repo.py" args=(
    --project-root "$ROOT"
  )
  [ -f "$checker" ] || {
    echo "error: pinned source ratchet does not exist: $checker" >&2
    return 1
  }
  if [ -d "$ROOT/.fkst/conformance/allowlists" ]; then
    args+=(--allowlist-dir "$ROOT/.fkst/conformance/allowlists")
  fi
  echo "=== host source ratchets ==="
  PYTHONPATH="$shared/scripts${PYTHONPATH:+:$PYTHONPATH}" \
    python3 -B "$checker" "${args[@]}"
}

run_engine_conformance() {
  echo "=== host engine conformance ==="
  "$BIN" conformance --project-root "$ROOT" "${ENGINE_PACKAGE_ROOT_ARGS[@]}"
}

cleanup_test_roots() {
  [ -n "${TEST_RUNTIME_ROOT:-}" ] && rm -rf -- "$TEST_RUNTIME_ROOT"
  [ -n "${TEST_DURABLE_ROOT:-}" ] && rm -rf -- "$TEST_DURABLE_ROOT"
}

cmd_check() {
  python3 -B "$ROOT/scripts/check_single_platform_pin.py"
  run_source_ratchets
  resolve_bin
  load_package_roots
  run_engine_conformance
  echo "=== website probe_site_test.py ==="
  python3 -B "$ROOT/scripts/probe_site_test.py"
}

cmd_test() {
  local target="" pkg name ran=0
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -v|--verbose) FKST_TEST_VERBOSE=1; export FKST_TEST_VERBOSE ;;
      -*) echo "unknown test flag: $1" >&2; return 2 ;;
      *)
        [ -z "$target" ] || { echo "test accepts at most one package name" >&2; return 2; }
        target="$1" ;;
    esac
    shift
  done

  resolve_bin
  load_package_roots
  TEST_RUNTIME_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/fkst-website-test-rt.XXXXXX")"
  TEST_DURABLE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/fkst-website-test-durable.XXXXXX")"
  trap cleanup_test_roots EXIT
  export FKST_RUNTIME_ROOT="$TEST_RUNTIME_ROOT"
  export FKST_DURABLE_ROOT="$TEST_DURABLE_ROOT"
  unset FKST_GITHUB_WRITE FKST_SUPERVISOR_PID

  echo "=== self-test ==="
  "$BIN" --self-test
  run_engine_conformance
  for pkg in "$LOCAL_PACKAGES"/*; do
    [ -d "$pkg" ] || continue
    name="$(basename "$pkg")"
    [ -z "$target" ] || [ "$name" = "$target" ] || continue
    echo "=== $name ==="
    "$BIN" test --project-root "$ROOT" --package-root "$pkg"
    ran=$((ran + 1))
  done
  if [ "$ran" -eq 0 ]; then
    if [ -n "$target" ]; then
      echo "no website packages matched for '$target'" >&2
    else
      echo "no website packages found" >&2
    fi
    return 1
  fi
  cleanup_test_roots
  trap - EXIT
  TEST_RUNTIME_ROOT=""
  TEST_DURABLE_ROOT=""

  if [ -z "$target" ]; then
    echo "=== website status smoke ==="
    (cd "$ROOT/site" && npm run test:status)
  fi
}

case "${1:-}" in
  check|test) ;;
  -h|--help|help|"") usage; exit 0 ;;
  *) echo "unknown subcommand: $1" >&2; usage >&2; exit 2 ;;
esac

pin="$(read_fkst_packages_pin_from_lock)"
shared="$(ensure_fkst_packages_checkout "$pin")"

case "$1" in
  check) shift; cmd_check "$@" ;;
  test) shift; cmd_test "$@" ;;
esac
