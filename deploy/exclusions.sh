#!/usr/bin/env bash
# exclusions.sh — shell view of deploy/exclusions.json, which is the single
# source of truth for which sky cultures are kept OUT of every public
# deployment of this project.
#
# Sourced by both shell deploy paths (deploy/assemble.sh for the container
# build, deploy/pages.sh for the static GitHub Pages build). The list
# itself lives in JSON rather than here because deploy/filter_taxonomy.py
# needs the same list and the same per-culture reasons: a licence
# exclusion that silently applies to one deploy path and not another is
# the worst possible failure mode for this project, because it would look
# fine. Read exclusions.json for which cultures, and why.
#
# Exports:
#   EXCLUDE_CULTURES        array of culture ids to omit
#   assert_no_excluded_cultures <dir>   post-copy verification

_EXCLUSIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_EXCLUSIONS_JSON="$_EXCLUSIONS_DIR/exclusions.json"

if [[ ! -f "$_EXCLUSIONS_JSON" ]]; then
  echo "exclusions.sh: ERROR: $_EXCLUSIONS_JSON not found — refusing to" \
       "proceed rather than deploy with an empty exclusion list." >&2
  exit 1
fi

# Read the ids out of the JSON with python3 (already a hard dependency of
# this repo's tooling). Deliberately NOT a grep/sed parse: a parse that
# silently returns nothing on a reformatted file would publish exactly the
# cultures this list exists to withhold.
_read_exclusions() {
  python3 -c '
import json, sys
with open(sys.argv[1]) as fh:
    data = json.load(fh)
ids = [c["id"] for c in data["cultures"]]
if not ids:
    raise SystemExit("exclusions.json contains no cultures")
print("\n".join(ids))
' "$_EXCLUSIONS_JSON"
}

EXCLUDE_CULTURES=()
while IFS= read -r _line; do
  [[ -n "$_line" ]] && EXCLUDE_CULTURES+=("$_line")
done < <(_read_exclusions)

if [[ "${#EXCLUDE_CULTURES[@]}" -eq 0 ]]; then
  echo "exclusions.sh: ERROR: parsed an empty exclusion list from" \
       "$_EXCLUSIONS_JSON — refusing to proceed." >&2
  exit 1
fi

# assert_no_excluded_cultures <skycultures_dir>
#
# Fails the build if any excluded culture is present in the given
# directory. Called AFTER copying, so it catches a filter that stopped
# matching (a renamed directory, a changed loop, a copy that ran before
# the filter) rather than merely trusting that the filter ran. A filter
# that silently stops matching looks identical to a filter that worked.
assert_no_excluded_cultures() {
  local dir="$1"
  local ex found=0
  for ex in "${EXCLUDE_CULTURES[@]}"; do
    if [[ -e "$dir/$ex" ]]; then
      echo "ERROR: excluded culture '$ex' is present at $dir/$ex" >&2
      found=1
    fi
  done
  if [[ "$found" -ne 0 ]]; then
    echo "ERROR: refusing to publish — see deploy/exclusions.json." >&2
    return 1
  fi
  return 0
}
