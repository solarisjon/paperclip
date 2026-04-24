#!/usr/bin/env bash
set -euo pipefail

# Pull the latest upstream changes into your fork and re-apply your local commits.
#
# Usage:
#   ./scripts/daily-update.sh          # rebase master on upstream/master
#   ./scripts/daily-update.sh --merge  # merge instead of rebase

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

STRATEGY="rebase"
[[ "${1:-}" == "--merge" ]] && STRATEGY="merge"

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[0;34m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

# ── Safety checks ─────────────────────────────────────────────────────────────

if git rebase --show-current-patch &>/dev/null || [ -d "$ROOT/.git/rebase-merge" ] || [ -d "$ROOT/.git/rebase-apply" ]; then
  red "A rebase is already in progress. Resolve it first:"
  echo "  git rebase --continue   (after fixing conflicts)"
  echo "  git rebase --abort      (to cancel)"
  exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" = "HEAD" ]; then
  red "Detached HEAD — check out master first: git checkout master"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  bold "Stashing local changes..."
  git stash push -m "daily-update stash $(date +%Y-%m-%d)"
  STASHED=1
else
  STASHED=0
fi

# ── Fetch upstream ─────────────────────────────────────────────────────────────

blue "\n→ Fetching upstream (paperclipai/paperclip)..."
git fetch upstream

BEFORE=$(git rev-parse HEAD)
UPSTREAM_REF="upstream/${CURRENT_BRANCH}"

if ! git rev-parse "$UPSTREAM_REF" &>/dev/null; then
  UPSTREAM_REF="upstream/master"
fi

NEW_COMMITS=$(git log --oneline "$BEFORE".."$UPSTREAM_REF" | wc -l | tr -d ' ')

if [ "$NEW_COMMITS" -eq 0 ]; then
  green "Already up to date — no new upstream commits."
else
  bold "\n${NEW_COMMITS} new upstream commit(s):"
  git log --oneline "$BEFORE".."$UPSTREAM_REF"
fi

# ── Integrate changes ──────────────────────────────────────────────────────────

if [ "$NEW_COMMITS" -gt 0 ]; then
  blue "\n→ Integrating upstream via $STRATEGY..."
  if [ "$STRATEGY" = "rebase" ]; then
    git rebase "$UPSTREAM_REF"
  else
    git merge "$UPSTREAM_REF" --no-edit
  fi
fi

# ── Install deps if lockfile changed ──────────────────────────────────────────

LOCKFILE_CHANGED=$(git diff "$BEFORE" HEAD -- pnpm-lock.yaml | wc -l | tr -d ' ')
if [ "$LOCKFILE_CHANGED" -gt 0 ]; then
  blue "\n→ pnpm-lock.yaml changed — installing dependencies..."
  pnpm install --frozen-lockfile
else
  blue "\n→ Lockfile unchanged — skipping install."
fi

# ── Run DB migrations if any are new ─────────────────────────────────────────

NEW_MIGRATIONS=$(git diff "$BEFORE" HEAD --name-only -- 'packages/db/src/migrations/*.sql' | wc -l | tr -d ' ')
if [ "$NEW_MIGRATIONS" -gt 0 ]; then
  blue "\n→ ${NEW_MIGRATIONS} new migration(s) detected — running db:migrate..."
  pnpm db:migrate
else
  blue "\n→ No new migrations."
fi

# ── Push to your fork ─────────────────────────────────────────────────────────

blue "\n→ Pushing to origin/${CURRENT_BRANCH}..."
git push origin "$CURRENT_BRANCH" --force-with-lease

# ── Restore stash ─────────────────────────────────────────────────────────────

if [ "$STASHED" -eq 1 ]; then
  blue "\n→ Restoring stashed changes..."
  git stash pop
fi

green "\n✓ Done! Repo is up to date with upstream."
