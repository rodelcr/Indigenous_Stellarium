#!/usr/bin/env bash
# publish_pages.sh — push the static bundle built by deploy/build_static.sh to the
# gh-pages branch, which GitHub Pages serves.
#
# Split from build_static.sh on purpose: building is safe and repeatable, while
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
# The GitHub Pages half of a release; deploy/publish_space.sh is the other
# half and deploy/release.sh runs both. Keep their checks in step.
#
# Usage: deploy/publish_pages.sh [remote] [branch]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=exclusions.sh
source "$SCRIPT_DIR/exclusions.sh"

BUNDLE="$SCRIPT_DIR/.pages"
PAGES_BASE="${PAGES_BASE:-/Indigenous_Stellarium/}"
SOURCE_URL="${SOURCE_URL:-https://github.com/rodelcr/Indigenous_Stellarium}"
LIVE_URL="${LIVE_URL:-https://rodelcr.github.io/Indigenous_Stellarium/}"
REMOTE="${1:-origin}"
BRANCH="${2:-gh-pages}"
WORKTREE="$SCRIPT_DIR/.pages-worktree"

[[ -f "$BUNDLE/index.html" ]] || {
  echo "publish_pages.sh: ERROR: no bundle at $BUNDLE — run deploy/build_static.sh first." >&2
  exit 1
}

# Re-verify rather than trust that the bundle on disk came from a build
# that had the current exclusion list. verify_bundle.py is the build's own
# full check, plus the build stamp: the bundle must have been built under
# this exclusions.json, from this clean commit -- the gh-pages commit is
# labelled with HEAD's SHA and the app links to that source.
assert_no_excluded_cultures "$BUNDLE/skycultures"
assert_no_unpublished_authored "$REPO_ROOT/data/skycultures_authored" "$BUNDLE/skycultures"
python3 "$SCRIPT_DIR/verify_bundle.py" "$BUNDLE" --base "$PAGES_BASE" \
  --source-url "$SOURCE_URL" --expect-sha "$(git -C "$REPO_ROOT" rev-parse HEAD)"

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

# Commit on a throwaway local branch, never on "$BRANCH" itself. The publish
# pushes HEAD:$BRANCH, so the local name is irrelevant — and reusing the real
# name breaks the SECOND run, because the first leaves that branch behind and
# `checkout --orphan` refuses an existing name. That failure previously exited
# the script silently, after it had already printed a reassuring list of
# cultures, so a failed publish read exactly like a successful one.
STAGING_BRANCH="pages-publish-staging"
# The staging branch is deleted again after the push (below); it is only
# ever a vehicle for one commit.
(
  cd "$WORKTREE"
  git branch -D "$STAGING_BRANCH" >/dev/null 2>&1 || true
  # stderr is NOT swallowed here on purpose (see above).
  git checkout --orphan "$STAGING_BRANCH" >/dev/null
  # Empty the index and tree. Not `|| true`: if this failed, files from the
  # source checkout would be committed to gh-pages alongside the bundle.
  git rm -rf --quiet --ignore-unmatch .
  if [[ -n "$(git ls-files)" ]]; then
    echo "publish_pages.sh: ERROR: could not empty the staging worktree" >&2
    exit 1
  fi
  # -a preserves .nojekyll, without which GitHub's Jekyll step silently
  # drops any path starting with an underscore.
  cp -a "$BUNDLE"/. .
  git add -A
  git commit -q -m "deploy: static bundle from $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  git push --force "$REMOTE" "HEAD:$BRANCH"
)
local_tree="$(git -C "$REPO_ROOT" rev-parse "$STAGING_BRANCH^{tree}")"
git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
git -C "$REPO_ROOT" branch -D "$STAGING_BRANCH" >/dev/null 2>&1 || true

# Verify the REMOTE, not the local intent. A push that silently failed used
# to be indistinguishable from one that worked. Compare tree hashes: equal
# trees are equal content, where the file count this used to compare let a
# different tree of the same size pass.
git -C "$REPO_ROOT" fetch -q "$REMOTE" "$BRANCH"
remote_tree="$(git -C "$REPO_ROOT" rev-parse "$REMOTE/$BRANCH^{tree}")"
if [[ "$remote_tree" != "$local_tree" ]]; then
  echo "publish_pages.sh: ERROR: $REMOTE/$BRANCH has tree $remote_tree but the" \
       "bundle committed as $local_tree — the push did not land what was built." >&2
  exit 1
fi

# Captured to a variable, NOT piped into `grep -q`: under pipefail, grep
# exits on its first match, git takes SIGPIPE, the pipeline returns 141 and
# the `if` reads that as "not found" -- the check passed exactly when an
# excluded culture WAS on the remote.
remote_listing="$(git -C "$REPO_ROOT" ls-tree -r "$REMOTE/$BRANCH" --name-only)"
remote_files="$(printf '%s\n' "$remote_listing" | wc -l | tr -d ' ')"
for ex in "${EXCLUDE_CULTURES[@]}"; do
  if grep -q "^skycultures/$ex/" <<<"$remote_listing"; then
    echo "publish_pages.sh: ERROR: excluded culture '$ex' is present on" \
         "$REMOTE/$BRANCH after publishing." >&2
    exit 1
  fi
done

echo "publish_pages.sh: pushed to $REMOTE/$BRANCH ($remote_files files, tree verified on the remote)"

# Verify the LIVE site serves this build, as publish_space.sh does. The
# Pages build runs after the push and usually takes a minute or two.
built_js="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' "$BUNDLE/index.html" | head -1)"
[[ -n "$built_js" ]] || {
  echo "publish_pages.sh: ERROR: could not find the entry script name in the built index.html" >&2
  exit 1
}
# Query string: Pages' CDN caches index.html for up to 10 minutes, and a
# distinct URL asks for a fresh copy instead of the stale one.
for attempt in $(seq 1 30); do
  live="$(curl -fsSL "$LIVE_URL?publish=${local_tree:0:12}-$attempt" 2>/dev/null || true)"
  if grep -q "$built_js" <<<"$live"; then
    echo "publish_pages.sh: live at $LIVE_URL — serving $built_js (verified)"
    exit 0
  fi
  sleep 10
done
echo "publish_pages.sh: ERROR: $LIVE_URL is not serving $built_js after 5 minutes." \
     "The branch is updated (verified above) but Pages has not picked it up — check" \
     "the repository's Actions / Pages settings." >&2
exit 1
