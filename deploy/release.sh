#!/usr/bin/env bash
# release.sh — build and publish BOTH public deploys from one source commit.
#
#   GitHub Pages        https://rodelcr.github.io/Indigenous_Stellarium/
#   Hugging Face Space  https://rodelcr-indigenous-stellarium.static.hf.space/
#
# The two hosts must never diverge on what they ship: a culture withheld
# from one and live on the other would be this project's worst failure and
# would look fine from either side. So there is one builder
# (build_static.sh, parameterised only by base path) and this script runs
# it twice and publishes each result, refusing to start unless the source
# state is something the AGPL source link in the bundle can actually point
# at: a clean tree, on a commit that exists on origin.
#
# Each publisher verifies its own remote. This script verifies that the two
# bundles carry the same cultures before publishing either.
#
# Usage: deploy/release.sh [--pages-only | --space-only]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DO_PAGES=true
DO_SPACE=true
case "${1:-}" in
  "") ;;
  --pages-only) DO_SPACE=false ;;
  --space-only) DO_PAGES=false ;;
  *) echo "release.sh: unknown argument '$1'" >&2; exit 2 ;;
esac

# --- source state ------------------------------------------------------
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "release.sh: ERROR: working tree is not clean. The bundle is labelled" \
       "with HEAD's SHA and the app links to that source; commit or stash first." >&2
  git -C "$REPO_ROOT" status --short >&2
  exit 1
fi
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
git -C "$REPO_ROOT" fetch -q origin
if ! git -C "$REPO_ROOT" branch -r --contains "$HEAD_SHA" | grep -q '^ *origin/'; then
  echo "release.sh: ERROR: HEAD ($(git -C "$REPO_ROOT" rev-parse --short HEAD)) is not on" \
       "any origin branch. The AGPL source link must point at published source —" \
       "push first." >&2
  exit 1
fi
echo "release.sh: releasing $(git -C "$REPO_ROOT" rev-parse --short HEAD) (clean, on origin)"

# --- build both --------------------------------------------------------
echo
echo "release.sh: === build: GitHub Pages bundle ==="
"$SCRIPT_DIR/build_static.sh" "$SCRIPT_DIR/.pages"
echo
echo "release.sh: === build: Hugging Face Space bundle ==="
PAGES_BASE=/ "$SCRIPT_DIR/build_static.sh" "$SCRIPT_DIR/.space"

# --- the two bundles must ship the same content --------------------------
pages_cultures="$(ls "$SCRIPT_DIR/.pages/skycultures" | sort)"
space_cultures="$(ls "$SCRIPT_DIR/.space/skycultures" | sort)"
if [[ "$pages_cultures" != "$space_cultures" ]]; then
  echo "release.sh: ERROR: the two bundles ship different culture sets:" >&2
  diff <(echo "$pages_cultures") <(echo "$space_cultures") >&2 || true
  exit 1
fi
# Everything outside index.html and assets/ is base-path independent and
# must be byte-identical between the two.
if ! diff -rq "$SCRIPT_DIR/.pages" "$SCRIPT_DIR/.space" \
       --exclude=index.html --exclude=assets >/dev/null; then
  echo "release.sh: ERROR: the two bundles differ outside index.html/assets:" >&2
  diff -rq "$SCRIPT_DIR/.pages" "$SCRIPT_DIR/.space" --exclude=index.html --exclude=assets >&2 || true
  exit 1
fi
echo
echo "release.sh: both bundles ship the same $(echo "$pages_cultures" | wc -l | tr -d ' ') cultures; data identical outside index.html/assets"

# --- publish -----------------------------------------------------------
if [[ "$DO_PAGES" == true ]]; then
  echo
  echo "release.sh: === publish: GitHub Pages ==="
  "$SCRIPT_DIR/publish_pages.sh"
fi
if [[ "$DO_SPACE" == true ]]; then
  echo
  echo "release.sh: === publish: Hugging Face Space ==="
  "$SCRIPT_DIR/publish_space.sh"
fi

echo
echo "release.sh: done — $(git -C "$REPO_ROOT" rev-parse --short HEAD) is live on:"
[[ "$DO_PAGES" == true ]] && echo "  https://rodelcr.github.io/Indigenous_Stellarium/"
[[ "$DO_SPACE" == true ]] && echo "  https://rodelcr-indigenous-stellarium.static.hf.space/"
exit 0
