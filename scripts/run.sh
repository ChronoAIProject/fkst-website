#!/usr/bin/env bash
# Repository check and test entrypoint for fkst-website.
#
# This repo owns its test orchestration. The pinned fkst-packages checkout supplies
# source ratchets and composed package roots; the already-built engine supplies
# self-test, conformance, and package-test primitives.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="$ROOT/fkst.lock"
RUN_ROOT="$ROOT/.fkst/run"
LOCAL_PACKAGES="$ROOT/.fkst/local-packages"

# Emit "<id>\t<git-url>\t<resolved-rev>" for every external source in the lock. The lock
# is a table array, and `.fkst/compose/package-roots` addresses roots as `<id>:<path>`, so a
# host may compose more than one source. Hydrating a single hardcoded id was the one place
# that plurality was not carried through.
read_external_sources_from_lock() {
  python3 - "$LOCK_FILE" <<'PYLOCK'
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
if not sources:
    print("error: fkst.lock declares no external_source", file=sys.stderr)
    raise SystemExit(1)

for source in sources:
    identifier = source.get("id")
    git_url = source.get("git")
    rev = source.get("resolved", {}).get("rev")
    if not isinstance(identifier, str) or not identifier:
        print("error: fkst.lock external_source is missing id", file=sys.stderr)
        raise SystemExit(1)
    if not isinstance(git_url, str) or not git_url:
        print(f"error: fkst.lock external_source(id={identifier}) is missing git", file=sys.stderr)
        raise SystemExit(1)
    if not isinstance(rev, str) or not re.fullmatch(r"[0-9a-f]{40}", rev):
        print(
            f"error: fkst.lock external_source(id={identifier}) "
            "is missing resolved.rev as a full git SHA",
            file=sys.stderr,
        )
        raise SystemExit(1)
    print(f"{identifier}\t{git_url}\t{rev}")
PYLOCK
}

# Hydrate one external source into `.fkst/run/<id>`. A checkout already at the pinned
# revision is reused untouched, so a source that has not moved costs nothing; a source whose
# pin has moved is replaced. FKST_PACKAGES_RUNNER still overrides the shared platform source
# for local development, and only that one, because it names a single runner.
ensure_source_checkout() {
  local identifier="$1" git_url="$2" pin="$3" checkout current
  if [ "$identifier" = "fkst-packages-platform" ] && [ -n "${FKST_PACKAGES_RUNNER:-}" ]; then
    [ -d "$FKST_PACKAGES_RUNNER" ] || {
      echo "error: FKST_PACKAGES_RUNNER does not exist: $FKST_PACKAGES_RUNNER" >&2
      return 1
    }
    printf '%s\n' "$FKST_PACKAGES_RUNNER"
    return 0
  fi
  checkout="$RUN_ROOT/$identifier"
  if [ -d "$checkout/.git" ]; then
    current="$(git -C "$checkout" rev-parse HEAD 2>/dev/null || true)"
    if [ "$current" = "$pin" ]; then
      printf '%s\n' "$checkout"
      return 0
    fi
    rm -rf "$checkout"
  elif [ -e "$checkout" ]; then
    rm -rf "$checkout"
  fi

  mkdir -p "$(dirname "$checkout")"
  git clone --quiet --no-checkout "$git_url" "$checkout"
  git -C "$checkout" checkout --quiet "$pin"
  printf '%s\n' "$checkout"
}

# Hydrate every source the lock declares, and report the shared platform checkout, which the
# source ratchets still run from.
hydrate_all_sources() {
  local identifier git_url pin checkout
  shared=""
  while IFS=$'\t' read -r identifier git_url pin; do
    [ -n "$identifier" ] || continue
    checkout="$(ensure_source_checkout "$identifier" "$git_url" "$pin")" || return 1
    [ "$identifier" = "fkst-packages-platform" ] && shared="$checkout"
  done < <(read_external_sources_from_lock)
  [ -n "$shared" ] || {
    echo "error: fkst.lock is missing external_source(id=fkst-packages-platform)" >&2
    return 1
  }
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
      # `<source-id>:<path>` addresses a root inside a hydrated source. `fkst-packages:` is
      # the legacy spelling of the shared platform and keeps working; any other prefix is
      # resolved against `.fkst/run/<source-id>`, so composing a second source needs no
      # change here.
      fkst-packages:*) path="$shared/${line#fkst-packages:}" ;;
      *:*) path="$RUN_ROOT/${line%%:*}/${line#*:}" ;;
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

hydrate_all_sources

case "$1" in
  check) shift; cmd_check "$@" ;;
  test) shift; cmd_test "$@" ;;
esac
