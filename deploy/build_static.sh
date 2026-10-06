#!/usr/bin/env bash
# build_static.sh — build the fully static bundle that BOTH public deploys
# serve: GitHub Pages (deploy/publish_pages.sh) and the Hugging Face Static
# Space (deploy/publish_space.sh). One builder, two publishers, so the two
# hosts cannot drift on what they ship — they differ only in PAGES_BASE.
#
# Static is possible at all because web/src/draftStore.js falls back to
# the visitor's own browser storage when no backend answers: authored
# drafts never leave the visitor's machine. That is a weaker persistence
# story than the container deploy and a BETTER governance story, since
# steward review does not exist yet — nothing anyone types into the demo
# is collected by us.
#
# What this script does, in order:
#   1. verifies the generated artifacts exist (engine build, fetched cultures)
#   2. stages a FILTERED copy of web/public: fetched cultures by the
#      manifest's allowlist, authored ones by theirs (deploy/exclusions.json)
#   3. filters data/taxonomy.json to match, so no tree node points at data
#      this deployment does not ship (deploy/filter_taxonomy.py)
#   4. regenerates attribution.json from the filtered culture set, so the
#      credits describe exactly what is shipped
#   5. runs the Vite build against the staged public dir, with `base` set
#      to the host's subpath (/<repo>/ for GitHub Pages, / for the Space)
#   6. verifies the output (deploy/verify_bundle.py), failing the build
#      rather than publishing wrong
#
# It never pushes. Publishing is deploy/publish_pages.sh or
# deploy/publish_space.sh, deliberately separate steps; deploy/release.sh
# runs build + publish for both hosts from one source commit.
#
# Usage: deploy/build_static.sh [output_dir]
#   PAGES_BASE   deployment subpath      (default /Indigenous_Stellarium/;
#                use / for the Hugging Face Static Space)
#   SOURCE_URL   AGPL-3.0 corresponding-source link shown in the app.
#                This is a LICENCE OBLIGATION (§13 network use), not a
#                courtesy link, so the build verifies it made it into the
#                bundle rather than trusting that it did.
#   output_dir   defaults to deploy/.pages (git-ignored)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=exclusions.sh
source "$SCRIPT_DIR/exclusions.sh"

OUT="${1:-$SCRIPT_DIR/.pages}"
# Absolute, because the Vite build below runs from web/ and would resolve a
# relative output_dir against THAT directory, writing the bundle to
# web/deploy/... and then failing on the .nojekyll touch.
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
STAGE_PUBLIC="$SCRIPT_DIR/.pages-public"
PAGES_BASE="${PAGES_BASE:-/Indigenous_Stellarium/}"
SOURCE_URL="${SOURCE_URL:-https://github.com/rodelcr/Indigenous_Stellarium}"

# GitHub Pages serves a project site from /<repo>/, so the base must have
# both slashes or Vite emits asset URLs that 404 in production while
# looking fine in dev.
[[ "$PAGES_BASE" == /* && "$PAGES_BASE" == */ ]] || {
  echo "build_static.sh: ERROR: PAGES_BASE must start and end with '/' (got '$PAGES_BASE')" >&2
  exit 1
}

for required in web/public/engine web/public/skydata web/public/skycultures \
                web/public/cities.json data/taxonomy.json web/node_modules; do
  [[ -e "$REPO_ROOT/$required" ]] || {
    echo "build_static.sh: ERROR: $required not found — run scripts/build_engine.sh," \
         "scripts/fetch_skycultures.py, scripts/fetch_cities.py, and" \
         "'npm install' in web/ first (see README.md)." >&2
    exit 1
  }
done

echo "build_static.sh: base = $PAGES_BASE"

# --- 2. staged, filtered public dir -----------------------------------
rm -rf "$STAGE_PUBLIC" "$OUT"
mkdir -p "$STAGE_PUBLIC/skycultures"
[[ -f "$REPO_ROOT/web/public/favicon.svg" ]] && cp "$REPO_ROOT/web/public/favicon.svg" "$STAGE_PUBLIC/"
cp -R "$REPO_ROOT/web/public/engine" "$STAGE_PUBLIC/engine"
cp -R "$REPO_ROOT/web/public/skydata" "$STAGE_PUBLIC/skydata"
# Place list for the location picker. Lazy-loaded by the app, so its absence
# degrades quietly to "coordinates only" rather than erroring — which is
# exactly why it needs an explicit check rather than being noticed by a user.
cp "$REPO_ROOT/web/public/cities.json" "$STAGE_PUBLIC/cities.json"
# The engine's demo data carries sky cultures of its own; publish only the
# one the app boots. See deploy/exclusions.json.
prune_bundled_skycultures "$STAGE_PUBLIC/skydata"
prune_withheld_surveys "$STAGE_PUBLIC/skydata"

# Fetched cultures by ALLOWLIST: copy the names the manifest publishes, never
# "whatever is in the folder". web/public/skycultures also holds dev-staged
# authored drafts and exports, which are never cleaned up; iterating the
# folder shipped any of them the denylist did not happen to name.
for name in "${FETCHED_PUBLISHED[@]}"; do
  src="$REPO_ROOT/web/public/skycultures/$name"
  if [[ ! -d "$src" ]]; then
    echo "build_static.sh: ERROR: fetched culture '$name' is allowlisted but not at" \
         "$src — run scripts/fetch_skycultures.py." >&2
    exit 1
  fi
  if [[ -e "$src/.exported-from-drafts" ]]; then
    echo "build_static.sh: ERROR: $src was written by export_skyculture.py, not" \
         "fetched from upstream — refusing to ship it as '$name'." >&2
    exit 1
  fi
  cp -R "$src" "$STAGE_PUBLIC/skycultures/$name"
done
for dir in "$REPO_ROOT"/web/public/skycultures/*/; do
  name="$(basename "$dir")"
  in_list=false
  for a in "${FETCHED_PUBLISHED[@]}" "${AUTHORED_PUBLISHED[@]}"; do
    [[ "$name" == "$a" ]] && in_list=true
  done
  [[ "$in_list" == true ]] || echo "build_static.sh: not shipping '$name' (not allowlisted)"
done
# Cultures authored inside this project, per the manifest allowlist.
stage_authored_skycultures "$REPO_ROOT/data/skycultures_authored" "$STAGE_PUBLIC/skycultures"

assert_no_excluded_cultures "$STAGE_PUBLIC/skycultures"
assert_no_unpublished_authored "$REPO_ROOT/data/skycultures_authored" "$STAGE_PUBLIC/skycultures"

# --- 3. taxonomy filtered to match what is shipped --------------------
python3 "$SCRIPT_DIR/filter_taxonomy.py" \
  "$REPO_ROOT/data/taxonomy.json" "$STAGE_PUBLIC/taxonomy.json"

# --- 4. attribution regenerated from the filtered culture set ---------
python3 "$SCRIPT_DIR/generate_attribution.py" \
  "$STAGE_PUBLIC/skycultures" "$STAGE_PUBLIC/attribution.json" "$STAGE_PUBLIC/skydata"

# What built this bundle. The publishers refuse a bundle whose stamp does not
# match the current manifest and HEAD, so "build, tighten exclusions.json,
# publish" can no longer ship the old bundle.
python3 - "$STAGE_PUBLIC/build.json" "$SCRIPT_DIR/exclusions.json" \
  "$(git -C "$REPO_ROOT" rev-parse HEAD)" \
  "$([[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]] && echo true || echo false)" <<'STAMP'
import hashlib, json, sys
out, manifest, sha, dirty = sys.argv[1:]
with open(out, "w") as fh:
    json.dump({"source_sha": sha, "dirty": dirty == "true",
               "exclusions_sha256": hashlib.sha256(open(manifest, "rb").read()).hexdigest()},
              fh, indent=2)
    fh.write("\n")
STAMP

# --- 5. build ---------------------------------------------------------
(
  cd "$REPO_ROOT/web"
  PAGES_BASE="$PAGES_BASE" PAGES_PUBLIC_DIR="$STAGE_PUBLIC" \
  VITE_SOURCE_URL="$SOURCE_URL" VITE_DEPLOY_KIND=static \
    npx vite build --outDir "$OUT" --emptyOutDir
)

# GitHub Pages runs Jekyll by default, which silently drops files and
# directories whose names begin with an underscore. Nothing in this bundle
# starts with one today, but a future engine or survey asset could, and the
# failure would be a 404 with no explanation.
touch "$OUT/.nojekyll"

# --- 6. verify the artifact, not the intent ---------------------------
assert_no_excluded_cultures "$OUT/skycultures"
assert_no_unpublished_authored "$REPO_ROOT/data/skycultures_authored" "$OUT/skycultures"

# Everything else -- allowlisted culture set, taxonomy, complete attribution,
# skydata accounted for, AGPL link, base path, build stamp -- lives in one
# verifier, which both publishers run again before pushing.
python3 "$SCRIPT_DIR/verify_bundle.py" "$OUT" --base "$PAGES_BASE" --source-url "$SOURCE_URL"

echo "build_static.sh: bundle at $OUT ($(du -sh "$OUT" | cut -f1))"
echo "build_static.sh: shipped cultures:"
ls "$OUT/skycultures"
