#!/usr/bin/env bash
# Mirrors the checks in .github/workflows/pr.yml so you can validate locally
# before pushing. Run from the repo root.
#
# Usage:
#   ./scripts/ci-preflight.sh                  # all checks
#   ./scripts/ci-preflight.sh --skip-build     # skip the slow build step
#   ./scripts/ci-preflight.sh --skip-tests     # skip test run

# No pipefail — we check exit codes explicitly with run()
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
SKIP_TESTS=0
for arg in "$@"; do
  [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=1
  [[ "$arg" == "--skip-tests" ]] && SKIP_TESTS=1
done

red()    { printf '\033[0;31m✗ %s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m✓ %s\033[0m\n' "$*"; }
blue()   { printf '\033[0;34m» %s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m⚠ %s\033[0m\n' "$*"; }

FAILED=0

# run LABEL CMD... — runs command, prints pass/fail, never exits early
run() {
  local label="$1"; shift
  local log="/tmp/ci-preflight-${label//[^a-z0-9]/-}.log"
  if "$@" >"$log" 2>&1; then
    green "$label"
  else
    red "$label (exit $?)"
    tail -20 "$log" | sed 's/^/    /'
    FAILED=1
  fi
}

# ── 1. Lockfile policy ────────────────────────────────────────────────────────
blue "Check: pnpm-lock.yaml not modified vs upstream/master"
if git diff --name-only upstream/master...HEAD | grep -qx 'pnpm-lock.yaml'; then
  red "pnpm-lock.yaml is modified vs upstream/master"
  printf '    Fix: git checkout upstream/master -- pnpm-lock.yaml\n'
  FAILED=1
else
  green "pnpm-lock.yaml clean"
fi

# ── 2. Dockerfile deps stage ──────────────────────────────────────────────────
blue "Check: Dockerfile deps stage"
missing=0
deps_stage="$(awk '/^FROM .* AS deps$/{found=1; next} found && /^FROM /{exit} found{print}' Dockerfile)"
search_roots="$(grep '^ *- ' pnpm-workspace.yaml | sed 's/^ *- //' | sed 's/\*$//' \
  | grep -v 'examples' | grep -v 'create-paperclip-plugin' | tr '\n' ' ')"

for pkg in $(find $search_roots -maxdepth 2 -name package.json \
    -not -path '*/examples/*' \
    -not -path '*/create-paperclip-plugin/*' \
    -not -path '*/node_modules/*' 2>/dev/null | sort -u); do
  dir="$(dirname "$pkg")"
  if ! echo "$deps_stage" | grep -q "^COPY ${dir}/package.json"; then
    red "Dockerfile deps stage missing: COPY ${pkg} ${dir}/"
    missing=1; FAILED=1
  fi
done
if [ -d patches ] && ! echo "$deps_stage" | grep -q '^COPY patches/'; then
  red "Dockerfile deps stage missing: COPY patches/ patches/"
  missing=1; FAILED=1
fi
[ "$missing" -eq 0 ] && green "Dockerfile deps stage in sync"

# ── 3. Dependency resolution ──────────────────────────────────────────────────
blue "Check: package.json manifests resolve against lockfile"
if git diff --name-only upstream/master...HEAD \
    | grep -Eq '(^|/)package\.json$|^pnpm-workspace\.yaml$'; then
  run "dependency resolution" \
    pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile
else
  green "No manifest changes — skipping resolution check"
fi

# ── 4. Typecheck ──────────────────────────────────────────────────────────────
blue "Check: typecheck (changed packages only)"
CHANGED_PKGS=()
changed_files="$(git diff --name-only upstream/master...HEAD)"
echo "$changed_files" | grep -q '^packages/db/'       && CHANGED_PKGS+=("@paperclipai/db")
echo "$changed_files" | grep -q '^packages/shared/'   && CHANGED_PKGS+=("@paperclipai/shared")
echo "$changed_files" | grep -q '^packages/adapters/' && CHANGED_PKGS+=("@paperclipai/adapter-crush-local")
echo "$changed_files" | grep -q '^server/'            && CHANGED_PKGS+=("@paperclipai/server")
echo "$changed_files" | grep -q '^ui/'                && CHANGED_PKGS+=("@paperclipai/ui")

if [ "${#CHANGED_PKGS[@]}" -gt 0 ]; then
  for pkg in "${CHANGED_PKGS[@]}"; do
    run "typecheck $pkg" pnpm --filter "$pkg" typecheck
  done
else
  green "No package changes detected"
fi

# ── 5. Tests ──────────────────────────────────────────────────────────────────
if [ "$SKIP_TESTS" -eq 0 ]; then
  blue "Check: tests"
  run "tests" pnpm test:run
else
  yellow "Tests skipped (--skip-tests)"
fi

# ── 6. Build ──────────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ]; then
  blue "Check: build"
  run "build" pnpm build
else
  yellow "Build skipped (--skip-build)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ "$FAILED" -eq 1 ]; then
  red "One or more checks failed — fix before pushing"
  exit 1
else
  green "All checks passed — safe to push"
fi
