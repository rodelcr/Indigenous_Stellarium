#!/usr/bin/env bash
# pages.sh — build the fully static bundle published to GitHub Pages.
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
#   2. stages a FILTERED copy of web/public, omitting every culture listed
#      in deploy/exclusions.json
#   3. filters data/taxonomy.json to match, so no tree node points at data
#      this deployment does not ship (deploy/filter_taxonomy.py)
#   4. regenerates attribution.json from the filtered culture set, so the
#      credits describe exactly what is shipped
#   5. runs the Vite build against the staged public dir, with `base` set
#      to the GitHub Pages project subpath
#   6. verifies the output, failing the build rather than publishing wrong
#
# It never pushes. Publishing is deploy/publish_pages.sh, deliberately a
# separate step.
#
# Usage: deploy/pages.sh [output_dir]
#   PAGES_BASE   deployment subpath      (default /Indigenous_Stellarium/)
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
STAGE_PUBLIC="$SCRIPT_DIR/.pages-public"
PAGES_BASE="${PAGES_BASE:-/Indigenous_Stellarium/}"
SOURCE_URL="${SOURCE_URL:-https://github.com/rodelcr/Indigenous_Stellarium}"

# GitHub Pages serves a project site from /<repo>/, so the base must have
# both slashes or Vite emits asset URLs that 404 in production while
# looking fine in dev.
[[ "$PAGES_BASE" == /* && "$PAGES_BASE" == */ ]] || {
  echo "pages.sh: ERROR: PAGES_BASE must start and end with '/' (got '$PAGES_BASE')" >&2
  exit 1
}

for required in web/public/engine web/public/skydata web/public/skycultures \
                web/public/cities.json data/taxonomy.json web/node_modules; do
  [[ -e "$REPO_ROOT/$required" ]] || {
    echo "pages.sh: ERROR: $required not found — run scripts/build_engine.sh," \
         "scripts/fetch_skycultures.py, scripts/fetch_cities.py, and" \
         "'npm install' in web/ first (see README.md)." >&2
    exit 1
  }
done

echo "pages.sh: base = $PAGES_BASE"

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

for dir in "$REPO_ROOT"/web/public/skycultures/*/; do
  name="$(basename "$dir")"
  skip=false
  for ex in "${EXCLUDE_CULTURES[@]}"; do
    [[ "$name" == "$ex" ]] && skip=true
  done
  if [[ "$skip" == true ]]; then
    echo "pages.sh: withholding culture '$name' (see deploy/exclusions.json)"
    continue
  fi
  cp -R "$dir" "$STAGE_PUBLIC/skycultures/$name"
done
assert_no_excluded_cultures "$STAGE_PUBLIC/skycultures"

# --- 3. taxonomy filtered to match what is shipped --------------------
python3 "$SCRIPT_DIR/filter_taxonomy.py" \
  "$REPO_ROOT/data/taxonomy.json" "$STAGE_PUBLIC/taxonomy.json"

# --- 4. attribution regenerated from the filtered culture set ---------
python3 "$SCRIPT_DIR/generate_attribution.py" \
  "$STAGE_PUBLIC/skycultures" "$STAGE_PUBLIC/attribution.json"

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

python3 - "$OUT" "$PAGES_BASE" "$SOURCE_URL" <<'PY'
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
out, base, source_url = Path(sys.argv[1]), sys.argv[2], sys.argv[3]

index = (out / "index.html").read_text(encoding="utf-8")
assert f'src="{base}assets/' in index or f"src='{base}assets/" in index, (
    f"index.html does not reference the base path {base!r} — the deployed "
    "page would request its JS from the wrong path and render nothing"
)

taxonomy = json.loads((out / "taxonomy.json").read_text(encoding="utf-8"))
shipped = {p.name for p in (out / "skycultures").iterdir() if p.is_dir()}
missing = [
    c["id"]
    for b in taxonomy
    for c in b.get("children", [])
    if c.get("skyculture_id") and c["skyculture_id"] not in shipped
]
assert not missing, (
    f"taxonomy offers cultures whose data is not in the bundle: {missing}"
)

# AGPL-3.0 s13: a network deployment must offer its corresponding source.
# Check the built bundle, not the config that was meant to produce it.
bundle = "".join(p.read_text(encoding="utf-8") for p in (out / "assets").glob("*.js"))
assert source_url in bundle, (
    f"the AGPL source link {source_url!r} is not present in the built "
    "bundle — publishing without it would not satisfy AGPL-3.0 section 13"
)

# Every sky culture reaching the public must be one the attribution panel
# covers. The panel is generated from skycultures/ only, so a culture riding
# along inside skydata/ would ship with no author or licence shown.
bundled_dir = out / "skydata" / "skycultures"
if bundled_dir.is_dir():
    bundled = {p.name for p in bundled_dir.iterdir() if p.is_dir()}
    stray = bundled - shipped
    assert not stray, (
        f"skydata ships sky cultures the attribution panel does not cover: "
        f"{sorted(stray)} — they would be published with no credit shown"
    )

cities = out / "cities.json"
assert cities.is_file(), (
    "cities.json is missing from the bundle — the location picker's place "
    "search would fail silently on the deployed site"
)

attribution = json.loads((out / "attribution.json").read_text(encoding="utf-8"))
attributed = {r["id"] for r in attribution}
assert attributed == shipped, (
    f"attribution does not match shipped cultures "
    f"(only in bundle: {sorted(shipped - attributed)}; "
    f"only in attribution: {sorted(attributed - shipped)})"
)

print(f"pages.sh: verified {len(shipped)} cultures, all attributed, "
      f"no dangling taxonomy references, AGPL source link present")
PY

echo "pages.sh: bundle at $OUT ($(du -sh "$OUT" | cut -f1))"
echo "pages.sh: shipped cultures:"
ls "$OUT/skycultures"
