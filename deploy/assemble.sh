#!/usr/bin/env bash
# assemble.sh — assemble the Hugging Face Space payload: a filtered copy
# of this repo's deploy-relevant files, mirroring the repo's own layout
# (deploy/, backend/, web/) so deploy/Dockerfile's COPY paths work
# unchanged whether it's building from the real repo root or from this
# assembled payload.
#
# The ONLY filtering this script does is excluding sky-culture
# directories from web/public/skycultures/ before anything is copied.
# WHICH cultures, and why, lives in deploy/exclusions.sh — shared with the
# static GitHub Pages build (deploy/pages.sh) so the two deploy paths
# cannot drift apart on a licence question.
#
# Usage: deploy/assemble.sh [output_dir]
#   output_dir defaults to deploy/.payload (git-ignored — see .gitignore).
#
# This script only SELECTS and COPIES files; it never runs npm/pip/docker
# itself. HF builds the Docker image remotely from what this assembles.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=exclusions.sh
source "$SCRIPT_DIR/exclusions.sh"

REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="${1:-$SCRIPT_DIR/.payload}"

# data/taxonomy.json, not web/public/taxonomy.json: the latter is a generated
# copy and the two drift. They were out of sync when this was found — the
# generated copy was missing the yana_phuyu node — so this path was silently
# shipping a payload with a culture absent from its tree.
for required in web/public/engine web/public/skydata web/public/skycultures \
                web/public/cities.json data/taxonomy.json; do
  if [[ ! -e "$REPO_ROOT/$required" ]]; then
    echo "assemble.sh: ERROR: $required not found — run scripts/build_engine.sh" \
         "and scripts/fetch_skycultures.py first (see README.md)." >&2
    exit 1
  fi
done

echo "assemble.sh: assembling payload at $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"

# --- deploy tooling, mirroring repo layout ---
mkdir -p "$OUT/deploy"
cp "$SCRIPT_DIR/Dockerfile" "$OUT/Dockerfile"
cp "$SCRIPT_DIR/serve.py" "$OUT/deploy/serve.py"
cp "$SCRIPT_DIR/generate_attribution.py" "$OUT/deploy/generate_attribution.py"
cp "$SCRIPT_DIR/README_space.md" "$OUT/README.md"

# --- backend (source only — no .venv, no db file, no __pycache__) ---
mkdir -p "$OUT/backend"
cp "$REPO_ROOT/backend/app.py" "$REPO_ROOT/backend/db.py" "$REPO_ROOT/backend/requirements.txt" "$OUT/backend/"

# --- web source (no node_modules, no dist) ---
mkdir -p "$OUT/web"
cp "$REPO_ROOT/web/package.json" "$REPO_ROOT/web/package-lock.json" \
   "$REPO_ROOT/web/vite.config.js" "$REPO_ROOT/web/index.html" "$OUT/web/"
cp -R "$REPO_ROOT/web/src" "$OUT/web/src"

# --- web public assets: engine, skydata, taxonomy copied whole; ---
# --- skycultures copied one directory at a time, skipping the three ---
# --- excluded cultures. ---
mkdir -p "$OUT/web/public/skycultures"
[[ -f "$REPO_ROOT/web/public/favicon.svg" ]] && cp "$REPO_ROOT/web/public/favicon.svg" "$OUT/web/public/"
cp -R "$REPO_ROOT/web/public/engine" "$OUT/web/public/engine"
cp -R "$REPO_ROOT/web/public/skydata" "$OUT/web/public/skydata"
cp "$REPO_ROOT/web/public/cities.json" "$OUT/web/public/cities.json"
# Same hole as the static path had: the engine's demo data carries sky
# cultures of its own, copied wholesale above. See deploy/exclusions.json.
prune_bundled_skycultures "$OUT/web/public/skydata"
prune_unattributed_surveys "$OUT/web/public/skydata"
# Excluding a culture's DIRECTORY is only half the job: a tree node still
# carrying its skyculture_id renders as a clickable culture that 404s and
# silently shows nothing. This path used to bare-copy the taxonomy while
# pages.sh filtered it, so the two deploys really did disagree on a licence
# question — exactly the drift exclusions.json was meant to prevent.
python3 "$SCRIPT_DIR/filter_taxonomy.py" \
  "$REPO_ROOT/data/taxonomy.json" "$OUT/web/public/taxonomy.json"

for dir in "$REPO_ROOT"/web/public/skycultures/*/; do
  name="$(basename "$dir")"
  skip=false
  for ex in "${EXCLUDE_CULTURES[@]}"; do
    [[ "$name" == "$ex" ]] && skip=true
  done
  if [[ "$skip" == true ]]; then
    echo "assemble.sh: excluding culture '$name' from payload (see header comment)"
    continue
  fi
  cp -R "$dir" "$OUT/web/public/skycultures/$name"
done

# --- verification: fail loudly if any excluded culture slipped in ---
assert_no_excluded_cultures "$OUT/web/public/skycultures"
# Verify the FILTERED taxonomy no longer offers any withheld culture. Built
# from the manifest rather than hardcoded ids — the previous version listed
# the three cultures literally, so adding a fourth to exclusions.json would
# have left this checking the old three, which is the drift the manifest
# exists to prevent.
python3 - "$OUT/web/public/taxonomy.json" "${EXCLUDE_CULTURES[@]}" <<'PYCHECK'
import json, sys
taxonomy = json.loads(open(sys.argv[1], encoding="utf-8").read())
excluded = set(sys.argv[2:])
leaked = [
    c.get("id")
    for b in taxonomy
    for c in (b.get("children") or [])
    if c.get("skyculture_id") in excluded
]
if leaked:
    raise SystemExit(
        f"assemble.sh: ERROR: payload taxonomy still offers withheld "
        f"cultures {leaked} — refusing to proceed."
    )
print("assemble.sh: taxonomy verified — no node points at a withheld culture")
PYCHECK

echo "assemble.sh: payload assembled at $OUT"
echo "assemble.sh: shipped cultures ($(ls "$OUT/web/public/skycultures" | wc -l | tr -d ' ')):"
ls "$OUT/web/public/skycultures"
