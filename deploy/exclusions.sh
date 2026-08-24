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
#   EXCLUDE_CULTURES               array of culture ids to omit
#   BUNDLED_SKYCULTURES_ALLOWED    array of ids allowed inside skydata/
#   assert_no_excluded_cultures <dir>       post-copy verification
#   prune_bundled_skycultures <skydata_dir> drop unused bundled cultures
#
# Two separate guards, because there are two separate sources of cultural
# content and only one of them was ever guarded:
#   1. web/public/skycultures/       — fetched from upstream, denylisted above
#   2. web/public/skydata/skycultures/ — the ENGINE'S OWN demo data, copied
#      wholesale by both deploy paths. Allowlisted, so a future skydata
#      refresh that adds a culture fails the build rather than publishing it
#      unexamined and unattributed.

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

_read_bundled_allowed() {
  python3 -c '
import json, sys
with open(sys.argv[1]) as fh:
    data = json.load(fh)
ids = data.get("bundled_skycultures_allowed")
if not ids:
    raise SystemExit("exclusions.json has no bundled_skycultures_allowed")
print("\n".join(ids))
' "$_EXCLUSIONS_JSON"
}

EXCLUDE_CULTURES=()
while IFS= read -r _line; do
  [[ -n "$_line" ]] && EXCLUDE_CULTURES+=("$_line")
done < <(_read_exclusions)

BUNDLED_SKYCULTURES_ALLOWED=()
while IFS= read -r _line; do
  [[ -n "$_line" ]] && BUNDLED_SKYCULTURES_ALLOWED+=("$_line")
done < <(_read_bundled_allowed)

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

# prune_bundled_skycultures <skydata_dir>
#
# The engine's bundled demo data carries sky cultures of its own. Only the
# ones the app actually loads may be published: anything else is unreachable
# in the UI and, because the attribution panel is generated from the FETCHED
# culture set, ships with no author or licence shown at all.
#
# Allowlist rather than denylist: an unrecognised culture is removed, so a
# future skydata refresh cannot quietly reintroduce this.
prune_bundled_skycultures() {
  local skydata_dir="$1"
  local sc_dir="$skydata_dir/skycultures"
  [[ -d "$sc_dir" ]] || return 0

  local dir name allowed a
  for dir in "$sc_dir"/*/; do
    [[ -d "$dir" ]] || continue
    name="$(basename "$dir")"
    allowed=false
    for a in "${BUNDLED_SKYCULTURES_ALLOWED[@]}"; do
      [[ "$name" == "$a" ]] && allowed=true
    done
    if [[ "$allowed" != true ]]; then
      echo "  dropping unused bundled culture '$name' from skydata" \
           "(not loaded by the app, and not covered by the attribution panel)"
      rm -rf "$dir"
    fi
  done

  # Verify the directory now contains only allowlisted ids.
  for dir in "$sc_dir"/*/; do
    [[ -d "$dir" ]] || continue
    name="$(basename "$dir")"
    allowed=false
    for a in "${BUNDLED_SKYCULTURES_ALLOWED[@]}"; do
      [[ "$name" == "$a" ]] && allowed=true
    done
    if [[ "$allowed" != true ]]; then
      echo "ERROR: bundled culture '$name' survived pruning at $dir" >&2
      return 1
    fi
  done
  return 0
}
