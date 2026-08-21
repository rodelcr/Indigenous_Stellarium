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


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(f"usage: {argv[0]} <skycultures_dir> <output_json>", file=sys.stderr)
        return 2

    skycultures_dir = Path(argv[1])
    output_path = Path(argv[2])

    if not skycultures_dir.is_dir():
        print(f"error: {skycultures_dir} is not a directory", file=sys.stderr)
        return 1

    records = build_attribution(skycultures_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"generate_attribution: wrote {len(records)} record(s) to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
