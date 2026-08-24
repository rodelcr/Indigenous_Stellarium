#!/usr/bin/env python3
"""filter_taxonomy.py — rewrite the culture taxonomy for a public deploy so
it never offers a culture whose data that deploy does not ship.

Why this exists. deploy/exclusions.json withholds some sky cultures from
public deployments (see docs/GOVERNANCE.md). Excluding the *directory* is
only half the job: `data/taxonomy.json` also carries a `skyculture_id` for
each culture, and a node still pointing at a withheld id renders as a
clickable culture that silently fails to load. The tree and the shipped
data have to be filtered together or the deploy is broken.

What it deliberately does NOT do:

  * It does not DELETE the excluded culture's node. Quietly removing a
    community from the tree is the wrong answer for a project whose whole
    premise is visibility, and it would hide the fact that a licence
    question is unresolved.

  * It does not convert the node into an ordinary `placeholder`. A
    placeholder in this app means "no dataset yet — help us build it",
    which for these cultures is FALSE: the data exists and is published
    upstream. Saying otherwise would misrepresent the community's record
    and could invite someone to re-contribute knowledge that has already
    been recorded.

Instead it clears `skyculture_id` (so nothing tries to load) and marks the
node `excluded: true` with the verbatim `reason` from exclusions.json, for
the UI to state plainly.

A culture that is already a placeholder (`skyculture_id: null`) is left
untouched even if it appears in the exclusion list — there is nothing to
withhold, and "no dataset yet" is the honest description. (This is the
`rapa_nui` case: the only thing on disk under that id is this project's own
throwaway demo export, which is excluded from the payload precisely so it
is not mistaken for real cultural content.)

Usage (importable):

    from filter_taxonomy import filter_taxonomy, load_exclusions
    deployed = filter_taxonomy(taxonomy, load_exclusions(path))

Usage (CLI):

    python deploy/filter_taxonomy.py data/taxonomy.json out/taxonomy.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

DEFAULT_EXCLUSIONS = Path(__file__).resolve().parent / "exclusions.json"


def load_exclusions(path: Path = DEFAULT_EXCLUSIONS) -> dict[str, str]:
    """Return {culture_id: reason} from the shared exclusions manifest.

    Raises rather than returning an empty mapping if the manifest is
    missing or lists nothing: an empty exclusion list would publish
    exactly the cultures the manifest exists to withhold, and failing
    loudly is the only safe behaviour.
    """
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    cultures = data.get("cultures") or []
    if not cultures:
        raise ValueError(f"{path}: exclusion manifest lists no cultures")
    out = {}
    for entry in cultures:
        cid = entry.get("id")
        reason = entry.get("reason")
        if not cid or not reason:
            raise ValueError(f"{path}: entry missing 'id' or 'reason': {entry!r}")
        out[cid] = reason
    return out


def filter_taxonomy(
    taxonomy: list[dict[str, Any]], exclusions: dict[str, str]
) -> list[dict[str, Any]]:
    """Return a deep-copied taxonomy with excluded cultures neutralised.

    Any child whose `skyculture_id` is an excluded id gets that id cleared
    and gains `excluded: True` plus `exclusion_reason` (verbatim from the
    manifest — never paraphrased here). Everything else is untouched,
    including children that are already placeholders.
    """
    result = json.loads(json.dumps(taxonomy))  # deep copy, plain-JSON data
    for bucket in result:
        for child in bucket.get("children") or []:
            sid = child.get("skyculture_id")
            if sid and sid in exclusions:
                child["skyculture_id"] = None
                child["excluded"] = True
                child["exclusion_reason"] = exclusions[sid]
    return result


def assert_no_excluded_ids(
    taxonomy: list[dict[str, Any]], exclusions: dict[str, str]
) -> None:
    """Fail if any node still points at withheld data.

    Run against the FILTERED output, so it catches a filter that stopped
    matching rather than merely trusting that it ran.
    """
    leaked = [
        child.get("id")
        for bucket in taxonomy
        for child in (bucket.get("children") or [])
        if child.get("skyculture_id") in exclusions
    ]
    if leaked:
        raise AssertionError(
            f"taxonomy still points at excluded culture data: {leaked} — "
            "refusing to publish (see deploy/exclusions.json)"
        )


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        print(
            "usage: filter_taxonomy.py <taxonomy_in.json> <taxonomy_out.json>",
            file=sys.stderr,
        )
        return 2
    src, dest = Path(argv[1]), Path(argv[2])
    exclusions = load_exclusions()
    taxonomy = json.loads(src.read_text(encoding="utf-8"))
    filtered = filter_taxonomy(taxonomy, exclusions)
    assert_no_excluded_ids(filtered, exclusions)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        json.dumps(filtered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    marked = [
        child.get("id")
        for bucket in filtered
        for child in (bucket.get("children") or [])
        if child.get("excluded")
    ]
    print(f"filter_taxonomy: wrote {dest}")
    print(f"filter_taxonomy: marked as excluded: {marked or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
