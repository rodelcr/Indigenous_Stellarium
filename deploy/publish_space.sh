#!/usr/bin/env bash
# publish_space.sh — push the static bundle built by deploy/build_static.sh
# (with PAGES_BASE=/) to a Hugging Face STATIC Space.
#
# Static, not Docker: Docker Spaces returned HTTP 402 on both of this
# project's accounts (2026-08-24), and a static site is the better
# governance story anyway — no server means nothing a visitor authors is
# collected by us. The bundle is byte-identical in content to the GitHub
# Pages one; only the asset base path differs, which is why it is built
# separately into deploy/.space rather than copied from deploy/.pages.
#
# Same discipline as publish_pages.sh: refuses a missing or stale bundle,
# re-runs the exclusion checks on what is on disk, and then verifies the
# REMOTE — every bundle file listed on the Space, no excluded culture
# present, and the live site actually serving this build's index.html.
#
# Talks to the Hub through huggingface_hub (python). Needs a logged-in
# token with write access to the Space: `hf auth login` once.
#
# Usage: deploy/publish_space.sh [space_id]
#   space_id    defaults to rodelcr/Indigenous_Stellarium
#   HF_PYTHON   python interpreter that can `import huggingface_hub`
#               (default: python3)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=exclusions.sh
source "$SCRIPT_DIR/exclusions.sh"

BUNDLE="$SCRIPT_DIR/.space"
STAGING="$SCRIPT_DIR/.space-staging"
SPACE_ID="${1:-rodelcr/Indigenous_Stellarium}"
HF_PYTHON="${HF_PYTHON:-python3}"

[[ -f "$BUNDLE/index.html" ]] || {
  echo "publish_space.sh: ERROR: no bundle at $BUNDLE — run" \
       "PAGES_BASE=/ deploy/build_static.sh deploy/.space first." >&2
  exit 1
}

# A bundle built for the Pages subpath would request /Indigenous_Stellarium/
# assets from a Space that serves at /, and render nothing. Check the
# artifact, not the flag that was supposed to have been passed.
if ! grep -q 'src="/assets/' "$BUNDLE/index.html"; then
  echo "publish_space.sh: ERROR: $BUNDLE/index.html does not reference /assets/ —" \
       "it was built for a different base path. Rebuild with PAGES_BASE=/." >&2
  exit 1
fi

# Re-verify rather than trust that the bundle on disk came from a build
# that had the current exclusion list.
assert_no_excluded_cultures "$BUNDLE/skycultures"
assert_no_unpublished_authored "$REPO_ROOT/data/skycultures_authored" "$BUNDLE/skycultures"

"$HF_PYTHON" -c 'import huggingface_hub' 2>/dev/null || {
  echo "publish_space.sh: ERROR: $HF_PYTHON cannot import huggingface_hub." \
       "Set HF_PYTHON to an interpreter that has it, or pip install huggingface_hub." >&2
  exit 1
}

echo "publish_space.sh: publishing $(du -sh "$BUNDLE" | cut -f1) to Space $SPACE_ID"
echo "publish_space.sh: cultures in bundle:"
ls "$BUNDLE/skycultures" | sed 's/^/  /'

# Stage a copy so the Space's own README (the front matter is what tells
# the Hub this is a static Space) can be added without touching the bundle.
rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -a "$BUNDLE"/. "$STAGING"/
cp "$SCRIPT_DIR/README_space.md" "$STAGING/README.md"
grep -q '^sdk: static$' "$STAGING/README.md" || {
  echo "publish_space.sh: ERROR: README_space.md front matter is not 'sdk: static'." >&2
  exit 1
}

SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

# One commit per publish: add every staged file, delete every remote file
# that is not in the staging dir (stale hashed assets, removed cultures).
# .gitattributes is the Hub's own LFS bookkeeping and is left alone.
# Then verify the remote listing against the local one — the push is not
# done until what landed matches what was built.
"$HF_PYTHON" - "$STAGING" "$SPACE_ID" "$SOURCE_SHA" "${EXCLUDE_CULTURES[@]}" <<'PY'
import sys
from pathlib import Path
from huggingface_hub import HfApi, CommitOperationAdd, CommitOperationDelete

staging, space_id, sha, *excluded = sys.argv[1:]
staging = Path(staging)
api = HfApi()

api.create_repo(space_id, repo_type="space", space_sdk="static", exist_ok=True)

local = {
    str(p.relative_to(staging)) for p in staging.rglob("*") if p.is_file()
}
remote_before = set(api.list_repo_files(space_id, repo_type="space"))
keep = {".gitattributes"}
stale = sorted(remote_before - local - keep)

ops = [CommitOperationAdd(path_in_repo=rel, path_or_fileobj=str(staging / rel))
       for rel in sorted(local)]
ops += [CommitOperationDelete(path_in_repo=rel) for rel in stale]
print(f"publish_space.sh: {len(local)} files to upload, {len(stale)} stale remote files to delete")

api.create_commit(
    repo_id=space_id,
    repo_type="space",
    operations=ops,
    commit_message=f"deploy: static bundle from {sha}",
)

remote = set(api.list_repo_files(space_id, repo_type="space"))
missing = sorted(local - remote)
extra = sorted(remote - local - keep)
if missing or extra:
    print(f"publish_space.sh: ERROR: remote does not match bundle — "
          f"{len(missing)} missing, {len(extra)} extra: "
          f"{missing[:5]} {extra[:5]}", file=sys.stderr)
    sys.exit(1)
for ex in excluded:
    if any(f.startswith(f"skycultures/{ex}/") for f in remote):
        print(f"publish_space.sh: ERROR: excluded culture '{ex}' is present on the Space "
              "after publishing.", file=sys.stderr)
        sys.exit(1)
print(f"publish_space.sh: {len(remote)} files on {space_id}, verified against the bundle")
PY

# Verify the LIVE site serves this build, not just that the repo holds it.
# A static Space republishes within seconds of a commit, but not instantly.
owner="${SPACE_ID%%/*}"
name="${SPACE_ID##*/}"
live_host="$(echo "${owner}-${name}" | tr '[:upper:]_' '[:lower:]-')"
LIVE_URL="https://${live_host}.static.hf.space/"
built_js="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' "$BUNDLE/index.html" | head -1)"
[[ -n "$built_js" ]] || {
  echo "publish_space.sh: ERROR: could not find the entry script name in the built index.html" >&2
  exit 1
}
for attempt in $(seq 1 12); do
  if curl -fsS "$LIVE_URL" 2>/dev/null | grep -q "$built_js"; then
    echo "publish_space.sh: live at $LIVE_URL — serving $built_js (verified)"
    exit 0
  fi
  sleep 10
done
echo "publish_space.sh: ERROR: $LIVE_URL is not serving $built_js after 2 minutes." \
     "The repo is updated (verified above) but the site has not picked it up — check" \
     "https://huggingface.co/spaces/$SPACE_ID for a build error." >&2
exit 1
