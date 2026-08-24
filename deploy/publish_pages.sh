#!/usr/bin/env bash
# publish_pages.sh — push the static bundle built by deploy/pages.sh to the
# gh-pages branch, which GitHub Pages serves.
#
# Split from pages.sh on purpose: building is safe and repeatable, while
# publishing puts cultural content on the public internet. Those should not
# share a command, and this one should be easy to read before running.
#
# The bundle is a build artifact, so each publish replaces gh-pages with a
# single fresh orphan commit and force-pushes. That keeps ~21 MB of engine
# and survey data from accumulating a new copy in history on every deploy.
# Nothing but generated output ever lives on that branch; the real history
# is on the source branch.
#
# Refuses to run unless the bundle exists and passes the same exclusion
# check the build applies — a stale bundle from before an exclusion was
# added must never be what gets published.
#
# Usage: deploy/publish_pages.sh [remote] [branch]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=exclusions.sh
source "$SCRIPT_DIR/exclusions.sh"

BUNDLE="$SCRIPT_DIR/.pages"
REMOTE="${1:-origin}"
BRANCH="${2:-gh-pages}"
WORKTREE="$SCRIPT_DIR/.pages-worktree"

[[ -f "$BUNDLE/index.html" ]] || {
  echo "publish_pages.sh: ERROR: no bundle at $BUNDLE — run deploy/pages.sh first." >&2
  exit 1
}

# Re-verify rather than trust that the bundle on disk came from a build
# that had the current exclusion list.
assert_no_excluded_cultures "$BUNDLE/skycultures"

git -C "$REPO_ROOT" remote get-url "$REMOTE" >/dev/null 2>&1 || {
  echo "publish_pages.sh: ERROR: no git remote named '$REMOTE'." >&2
  exit 1
}

echo "publish_pages.sh: publishing $(du -sh "$BUNDLE" | cut -f1) to $REMOTE/$BRANCH"
echo "publish_pages.sh: cultures in bundle:"
ls "$BUNDLE/skycultures" | sed 's/^/  /'

rm -rf "$WORKTREE"
git -C "$REPO_ROOT" worktree prune
# Detached orphan worktree: no branch checked out, nothing from the source
# tree present, so a stray file cannot ride along into the publish.
git -C "$REPO_ROOT" worktree add --detach "$WORKTREE" >/dev/null
trap 'git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true' EXIT

(
  cd "$WORKTREE"
  git checkout --orphan "$BRANCH" >/dev/null 2>&1
  git rm -rf . >/dev/null 2>&1 || true
  # -a preserves .nojekyll, without which GitHub's Jekyll step silently
  # drops any path starting with an underscore.
  cp -a "$BUNDLE"/. .
  git add -A
  git commit -q -m "deploy: static bundle from $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  git push --force "$REMOTE" "HEAD:$BRANCH"
)

echo "publish_pages.sh: pushed to $REMOTE/$BRANCH"
echo "publish_pages.sh: if Pages is not yet enabled, set it to deploy from"
echo "                  branch '$BRANCH' (root) in the repository settings."
