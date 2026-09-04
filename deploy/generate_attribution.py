#!/usr/bin/env python3
"""generate_attribution.py — build the deployed Space's attribution feed
from each shipped sky culture's OWN description.md.

Every sky culture pulled from stellarium-skycultures ships a
description.md with required H2 sections including "Authors" and
"License" (see docs/DESIGN.md's sky-culture format notes). Rather than
hand-writing attribution text for the deployed UI — which risks getting
someone's name or license wrong — this script extracts those two
sections verbatim from each culture's own description.md and emits them
as JSON for the frontend to render. It never invents, paraphrases, or
"cleans up" the source text; if a section is missing, it is reported as
missing rather than filled in.

Usage (CLI):

    python generate_attribution.py <skycultures_dir> <output_json>

Usage (importable):

    from generate_attribution import build_attribution
    build_attribution(Path("web/public/skycultures"))

`skycultures_dir` is expected to already reflect whatever set of
cultures is being shipped (this script does not itself decide which
culture directories are present — that filtering happens earlier, in
deploy/assemble.sh, which is also the place that excludes kamilaroi,
lokono, and rapa_nui from the deployed payload).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

H1_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
# Matches an H2 heading line ("## Something") anywhere, used both to find
# the start of a target section and to find where the NEXT section begins
# (which bounds the target section's text).
H2_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)


def _extract_section(text: str, heading: str) -> str | None:
    """Return the body text of the H2 section named `heading` (exclusive
    of the heading line itself), or None if that section doesn't exist.
    The body runs until the next H2 heading or end of file. Matching is
    case-sensitive on the heading text as it actually appears — the
    sky-culture format's documented sections use consistent capitalization
    ("Authors", "License"), and silently accepting near-misses risks
    picking up the wrong text.
    """
    headings = list(H2_RE.finditer(text))
    for i, m in enumerate(headings):
        if m.group(1).strip() != heading:
            continue
        start = m.end()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        return text[start:end].strip()
    return None


def parse_description(text: str) -> dict[str, str | None]:
    """Pull the culture's H1 title plus its Authors and License section
    bodies out of a description.md's raw text. Returns a dict with keys
    'title', 'authors_md', 'license_md' — any of which is None if that
    part isn't present in the source file (never fabricated).
    """
    h1_match = H1_RE.search(text)
    title = h1_match.group(1).strip() if h1_match else None
    return {
        "title": title,
        "authors_md": _extract_section(text, "Authors"),
        "license_md": _extract_section(text, "License"),
    }


def build_attribution(skycultures_dir: Path) -> list[dict[str, Any]]:
    """Walk every immediate subdirectory of `skycultures_dir` that has a
    description.md and build one attribution record per culture, sorted
    by directory id for a stable, reviewable diff. Directories without a
    description.md are skipped with a warning to stderr rather than
    silently omitted — a culture with no attribution data is a problem
    worth noticing, not hiding.
    """
    records = []
    for entry in sorted(skycultures_dir.iterdir()):
        if not entry.is_dir():
            continue
        desc_path = entry / "description.md"
        if not desc_path.is_file():
            print(
                f"generate_attribution: WARNING: {entry.name} has no "
                "description.md, skipping",
                file=sys.stderr,
            )
            continue
        text = desc_path.read_text(encoding="utf-8")
        parsed = parse_description(text)
        if parsed["authors_md"] is None or parsed["license_md"] is None:
            print(
                f"generate_attribution: WARNING: {entry.name} description.md "
                f"is missing {'Authors' if parsed['authors_md'] is None else 'License'} "
                "section",
                file=sys.stderr,
            )
        records.append(
            {
                "id": entry.name,
                "title": parsed["title"] or entry.name,
                "authors_md": parsed["authors_md"],
                "license_md": parsed["license_md"],
            }
        )
    return records


# HiPS `properties` fields that carry credit, in the order a reader should
# see them. Names per the IVOA HiPS standard; verified present on
# data.stellarium.org's own surveys (gaia_dr2_v2 carries obs_copyright and
# obs_ack, dss carries obs_copyright, obs_copyright_url and hips_creator).
SURVEY_CREDIT_FIELDS = ("obs_title", "hips_creator", "obs_copyright",
                        "obs_copyright_url", "obs_ack")


def parse_survey_properties(text: str) -> dict[str, str]:
    """Parse a HiPS properties file into a dict.

    Format is `key = value` with values that may contain '='; split on the
    first only. Comment lines start with '#'.
    """
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip()
    return out


def build_survey_attribution(skydata_dir: Path) -> list[dict[str, Any]]:
    """Credit for every HiPS survey being shipped.

    The Gaia survey's obs_ack is a specific text ESA requires of anyone using
    the data; shipping the survey without displaying it would not meet that.
    Surveys stating no credit at all are reported with `credited: False`
    rather than omitted — a survey nobody can be credited for is a thing to
    notice, and deploy/exclusions.json is where it gets withheld.
    """
    records = []
    surveys_dir = skydata_dir / "surveys"
    if not surveys_dir.is_dir():
        return records
    for entry in sorted(surveys_dir.iterdir()):
        if not entry.is_dir():
            continue
        props_path = entry / "properties"
        if not props_path.is_file():
            continue
        props = parse_survey_properties(
            props_path.read_text(encoding="utf-8", errors="replace")
        )
        credit = {k: props[k] for k in SURVEY_CREDIT_FIELDS if props.get(k)}
        # obs_title is a label, not credit. A survey counts as credited only
        # if it names a creator, a copyright holder, or an acknowledgement —
        # otherwise "credited" would be true for anything with a name.
        credited = any(credit.get(k) for k in
                       ("hips_creator", "obs_copyright", "obs_ack"))
        records.append({
            "id": entry.name,
            "type": props.get("type") or props.get("dataproduct_type"),
            "credited": credited,
            **credit,
        })
    return records


def main(argv: list[str]) -> int:
    if len(argv) not in (3, 4):
        print(f"usage: {argv[0]} <skycultures_dir> <output_json> [skydata_dir]",
              file=sys.stderr)
        return 2

    skycultures_dir = Path(argv[1])
    output_path = Path(argv[2])
    skydata_dir = Path(argv[3]) if len(argv) == 4 else None

    if not skycultures_dir.is_dir():
        print(f"error: {skycultures_dir} is not a directory", file=sys.stderr)
        return 1

    cultures = build_attribution(skycultures_dir)
    surveys = build_survey_attribution(skydata_dir) if skydata_dir else []

    # Object rather than the bare list this used to emit, so survey credit has
    # somewhere to live. The frontend accepts both shapes; see InfoPanel.
    payload = {"cultures": cultures, "surveys": surveys}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                           encoding="utf-8")
    print(f"generate_attribution: wrote {len(cultures)} culture record(s) and "
          f"{len(surveys)} survey record(s) to {output_path}")
    for s in surveys:
        if not s["credited"]:
            print(f"generate_attribution: WARNING: survey {s['id']!r} states no "
                  "credit of any kind", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
