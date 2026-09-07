#!/usr/bin/env bash
#
# Stage EVERY authored sky culture into the dev server's public directory.
#
# This is deliberately NOT the deploy path. deploy/exclusions.sh stages only
# the cultures named in the manifest's `authored_skycultures_published`
# allowlist, because publishing a community's knowledge must be a deliberate
# act. Locally there is nothing to publish to and nobody to publish to, so a
# developer should be able to see every draft they are working on -- which
# until now they could not: `osage` was live on Pages and 404'd in `npm run
# dev`, because nothing copied it.
#
# It also refreshes two other git-ignored files the dev server serves but
# nothing was regenerating: web/public/taxonomy.json (the culture tree) and
# web/public/attribution.json (the credits feed). Both were hand-copied once
# and had drifted, so a culture added to data/taxonomy.json simply did not
# appear in `npm run dev` -- with no error anywhere to say why.
#
# Git-ignored destinations; regenerate freely.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/data/skycultures_authored"
DEST="$REPO_ROOT/web/public/skycultures"

[[ -d "$SRC" ]] || { echo "no authored cultures at $SRC" >&2; exit 0; }
mkdir -p "$DEST"

for dir in "$SRC"/*/; do
  [[ -d "$dir" ]] || continue
  name="$(basename "$dir")"
  # rm first: `cp -R src dest/name` copies INTO an existing dest/name,
  # producing dest/name/name and leaving a stale copy behind. Same trap the
  # deploy path hit.
  rm -rf "${DEST:?}/$name"
  cp -R "$dir" "$DEST/$name"
  if [[ -e "$DEST/$name/$name" ]]; then
    echo "ERROR: nested '$name/$name' after staging" >&2
    exit 1
  fi
  echo "  staged authored culture '$name' for dev"
done

# The culture tree. Served from web/public/, authored in data/ -- nothing
# copied it, so edits to data/taxonomy.json were invisible in dev.
cp "$REPO_ROOT/data/taxonomy.json" "$REPO_ROOT/web/public/taxonomy.json"
echo "  refreshed taxonomy.json for dev"

# The credits feed, rebuilt from whatever is actually staged above.
if [[ -x "$REPO_ROOT/backend/.venv/bin/python" ]]; then
  "$REPO_ROOT/backend/.venv/bin/python" "$REPO_ROOT/deploy/generate_attribution.py" \
    "$DEST" "$REPO_ROOT/web/public/attribution.json" "$REPO_ROOT/web/public/skydata" \
    >/dev/null && echo "  refreshed attribution.json for dev"
fi
