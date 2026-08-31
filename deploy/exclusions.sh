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

_read_unattributed_surveys() {
  python3 -c '
import json, sys
with open(sys.argv[1]) as fh:
    data = json.load(fh)
print("\n".join(data.get("unattributed_surveys") or []))
' "$_EXCLUSIONS_JSON"
}

_read_authored_published() {
  python3 -c '
import json, sys
with open(sys.argv[1]) as fh:
    data = json.load(fh)
print("\n".join(data.get("authored_skycultures_published") or []))
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

# An empty allowlist is far more dangerous than an empty denylist, and it is
# reachable: a SystemExit inside `< <(...)` process substitution does NOT
# trip `set -e`, so a renamed or removed manifest key just leaves the array
# empty. prune_bundled_skycultures would then judge EVERY bundled culture
# disallowed and delete them all -- including `western`, the one culture
# engine.js boots -- after which its own post-prune check and pages.sh's
# stray-culture check both pass vacuously, because there is nothing left to
# find. The build would report success and publish a viewer whose default
# sky culture 404s.
if [[ "${#BUNDLED_SKYCULTURES_ALLOWED[@]}" -eq 0 ]]; then
  echo "exclusions.sh: ERROR: parsed an empty bundled-culture allowlist from" \
       "$_EXCLUSIONS_JSON — refusing to proceed (this would delete every" \
       "bundled sky culture, including the one the app boots)." >&2
  exit 1
fi

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

  # A guard handed a path that does not exist finds nothing and would
  # "pass". This is the last line of defence in three scripts, so a typo, a
  # relative-path mismatch, or a future layout rename must fail loudly
  # rather than silently certify a directory nobody looked at.
  if [[ ! -d "$dir" ]]; then
    echo "ERROR: cannot verify exclusions — '$dir' does not exist." >&2
    return 1
  fi
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

AUTHORED_PUBLISHED=()
while IFS= read -r _line; do
  [[ -n "$_line" ]] && AUTHORED_PUBLISHED+=("$_line")
done < <(_read_authored_published)

# stage_authored_skycultures <src_dir> <dest_skycultures_dir>
#
# Cultures authored inside this project are drafts by default: they live in
# data/skycultures_authored/ and ship only when named in the manifest's
# allowlist. Publishing a community's knowledge should require someone to
# have written its name down, not merely to have left a file on disk.
stage_authored_skycultures() {
  local src="$1" dest="$2"
  local name
  for name in "${AUTHORED_PUBLISHED[@]}"; do
    if [[ ! -d "$src/$name" ]]; then
      echo "ERROR: authored culture '$name' is allowlisted but missing at $src/$name" >&2
      return 1
    fi
    cp -R "$src/$name" "$dest/$name"
    echo "  publishing authored culture '$name'"
  done
  return 0
}

UNATTRIBUTED_SURVEYS=()
while IFS= read -r _line; do
  [[ -n "$_line" ]] && UNATTRIBUTED_SURVEYS+=("$_line")
done < <(_read_unattributed_surveys)

# prune_unattributed_surveys <skydata_dir>
#
# Third content source, same shape as the bundled sky cultures: skydata/ is
# copied wholesale, so a survey mirrored into skydata/surveys/ for local
# development would ship publicly without anyone deciding to. These carry no
# obs_copyright, obs_ack or hips_creator, so there is nobody to credit —
# see deploy/exclusions.json.
prune_unattributed_surveys() {
  local skydata_dir="$1"
  local sv_dir="$skydata_dir/surveys"
  [[ -d "$sv_dir" ]] || return 0

  local name
  for name in "${UNATTRIBUTED_SURVEYS[@]}"; do
    if [[ -d "$sv_dir/$name" ]]; then
      echo "  withholding survey '$name' (no attribution stated by its source)"
      rm -rf "${sv_dir:?}/$name"
    fi
  done

  for name in "${UNATTRIBUTED_SURVEYS[@]}"; do
    if [[ -e "$sv_dir/$name" ]]; then
      echo "ERROR: unattributed survey '$name' survived pruning at $sv_dir/$name" >&2
      return 1
    fi
  done
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
  # Same reasoning as assert_no_excluded_cultures: a missing directory means
  # this guard inspected nothing, which is a failure, not a pass.
  if [[ ! -d "$sc_dir" ]]; then
    echo "ERROR: cannot prune bundled cultures — '$sc_dir' does not exist." >&2
    return 1
  fi

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
