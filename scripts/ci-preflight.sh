#!/usr/bin/env bash
# Mirrors the checks in .github/workflows/pr.yml so you can validate locally
# before pushing. Run from the repo root.
#
# Usage:
#   ./scripts/ci-preflight.sh                  # all checks
#   ./scripts/ci-preflight.sh --skip-build     # skip the slow build step
#   ./scripts/ci-preflight.sh --skip-tests     # skip test run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
SKIP_TESTS=0
for arg in "$@"; do
  [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=1
  [[ "$arg" == "--skip-tests" ]] && SKIP_TESTS=1
done

red()   { printf '\033[0;31m✗ %s\033[0m\n' "$*"; }
green() { printf '\033[0;32m✓ %s\033[0m\n' "$*"; }
blue()  { printf '\033[0;34m» %s\033[0m\n' "$*"; }

FAILED=0
fail() { red "$1"; FAILED=1; }

# ── 1. Lockfile policy (mirrors: Block manual lockfile edits) ─────────────────
blue "Check: pnpm-lock.yaml not modified vs upstream/master"
if git diff --name-only upstream/master...HEAD | grep -qx 'pnpm-lock.yaml'; then
  fail "pnpm-lock.yaml is modified vs upstream/master. Revert it:
       git checkout upstream/master -- pnpm-lock.yaml"
else
  green "pnpm-lock.yaml clean"
fi

# ── 2. Dockerfile deps stage (mirrors: Validate Dockerfile deps stage) ────────
blue "Check: Dockerfile deps stage"
missing=0
deps_stage="$(awk '/^FROM .* AS deps$/{found=1; next} found && /^FROM /{exit} found{print}' Dockerfile)"
search_roots="$(grep '^ *- ' pnpm-workspace.yaml | sed 's/^ *- //' | sed 's/\*$//' | grep -v 'examples' | grep -v 'create-paperclip-plugin' | tr '\n' ' ')"

for pkg in $(find $search_roots -maxdepth 2 -name package.json \
    -not -path '*/examples/*' \
    -not -path '*/create-paperclip-plugin/*' \
    -not -path '*/node_modules/*' 2>/dev/null | sort -u); do
  dir="$(dirname "$pkg")"
  if ! echo "$deps_stage" | grep -q "^COPY ${dir}/package.json"; then
    fail "Dockerfile deps stage missing: COPY ${pkg} ${dir}/"
    missing=1
  fi
done
if [ -d patches ] && ! echo "$deps_stage" | grep -q '^COPY patches/'; then
  fail "Dockerfile deps stage missing: COPY patches/ patches/"
  missing=1
fi
[ "$missing" -eq 0 ] && green "Dockerfile deps stage in sync"

# ── 3. Dependency resolution (mirrors: Validate dependency resolution) ────────
blue "Check: package.json manifests resolve against lockfile"
if git diff --name-only upstream/master...HEAD | grep -Eq '(^|/)package\.json$|^pnpm-workspace\.yaml$'; then
  # Use --lockfile-only so we don't write node_modules, just validate resolution
  if pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile 2>&1 | grep -i "ERR\|error" | grep -v "DeprecationWarning\|WARN"; then
    fail "Dependency resolution failed (package.json vs lockfile mismatch)"
  else
    green "Dependency resolution OK"
  fi
else
  green "No manifest changes — skipping resolution check"
fi

# ── 4. Typecheck (mirrors: Typecheck) ─────────────────────────────────────────
blue "Check: typecheck (changed packages only)"
CHANGED_PKGS=""
git diff --name-only upstream/master...HEAD | grep '^packages/db/'      && CHANGED_PKGS="$CHANGED_PKGS @paperclipai/db"
git diff --name-only upstream/master...HEAD | grep '^packages/shared/'  && CHANGED_PKGS="$CHANGED_PKGS @paperclipai/shared"
git diff --name-only upstream/master...HEAD | grep '^packages/adapters/' && CHANGED_PKGS="$CHANGED_PKGS @paperclipai/adapter-crush-local"
git diff --name-only upstream/master...HEAD | grep '^server/'           && CHANGED_PKGS="$CHANGED_PKGS @paperclipai/server"
git diff --name-only upstream/master...HEAD | grep '^ui/'               && CHANGED_PKGS="$CHANGED_PKGS @paperclipai/ui"

if [ -n "$CHANGED_PKGS" ]; then
  for pkg in $CHANGED_PKGS; do
    if pnpm --filter "$pkg" typecheck 2>&1 | grep -i "error TS"; then
      fail "typecheck failed: $pkg"
    else
      green "typecheck OK: $pkg"
    fi
  done
else
  green "No package changes detected"
fi

# ── 5. Tests (mirrors: Run tests) ─────────────────────────────────────────────
if [ "$SKIP_TESTS" -eq 0 ]; then
  blue "Check: tests"
  if pnpm test:run 2>&1 | tee /tmp/ci-preflight-tests.log | tail -5 | grep -i "failed\|error"; then
    fail "Tests failed — see /tmp/ci-preflight-tests.log"
  else
    green "Tests passed"
  fi
else
  printf '\033[0;33m⚠ Tests skipped (--skip-tests)\033[0m\n'
fi

# ── 6. Build (mirrors: Build) ─────────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ]; then
  blue "Check: build"
  if pnpm build 2>&1 | tail -5 | grep -i "error\|failed"; then
    fail "Build failed"
  else
    green "Build passed"
  fi
else
  printf '\033[0;33m⚠ Build skipped (--skip-build)\033[0m\n'
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ "$FAILED" -eq 1 ]; then
  red "One or more checks failed — fix before pushing"
  exit 1
else
  green "All checks passed — safe to push"
fi
