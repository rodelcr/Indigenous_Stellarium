#!/usr/bin/env python3
"""export_skyculture.py — turn drafts authored in this app into a
Stellarium-native sky-culture directory (`index.json` + `description.md`)
under `data/skycultures_exported/<culture_key>/`, in the same schema used by
the real cultures fetched from Stellarium/stellarium-skycultures (see
scripts/fetch_skycultures.py and docs/DESIGN.md's "Verified technical
facts"). This is the step that lets contributed knowledge leave this app
and load into real desktop/web Stellarium.

`export_culture(culture_key, drafts, dest)` is the whole surface. It takes
drafts as plain dicts — the exact shape `backend/db.py`'s
list_drafts()/get_draft() (and the API's DraftOut) already return — so it
needs no database connection and is fully unit-testable (see
tests/test_export_skyculture.py). The CLI is a thin wrapper that opens
backend/drafts.sqlite, reads every draft, and hands the ones matching
--culture to this function; export_culture() itself also filters by
culture_key defensively, so a caller can pass every draft in the table and
let this module do the filtering.

Hard rule, carried over from fetch_skycultures.py's provenance discipline
but pointed the other way: this script must never INVENT cultural content.
Every name, note, and attribution string it writes comes directly from a
draft's fields. Where a draft has no value for a field, the output omits
that field (index.json) or states the absence plainly (description.md) —
it never fabricates filler prose, a sample constellation, or a guessed
license. See docs/DESIGN.md's Phase 1 scope and the task-8 brief: content
licensing is an unmade Phase 2 governance decision, so the License section
states that plainly rather than asserting CC BY-SA (or any other license)
on a contributing community's behalf.

Usage (importable):

    from export_skyculture import export_culture
    export_culture("rapa_nui", drafts, Path("data/skycultures_exported"))

Usage (CLI):

    python scripts/export_skyculture.py --culture rapa_nui

Exports land in data/skycultures_exported/ (git-ignored), which is NOT a
deploy input: scripts/stage_authored_dev.sh serves them in dev, and nothing
publishes them. This used to default to web/public/skycultures -- the
directory the static build copies -- so any export shipped to both public
hosts with every guard passing (whole-branch review, 2026-10-05).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = REPO_ROOT / "backend" / "drafts.sqlite"
DEFAULT_DEST = REPO_ROOT / "data" / "skycultures_exported"

# Written into every export. export_culture refuses to replace a directory
# without it, so drafts keyed to a fetched culture (e.g. "maori") can never
# rmtree the upstream data; and deploy/verify_bundle.py refuses any fetched
# culture carrying it, so an export cannot pass itself off as upstream data.
EXPORT_SENTINEL = ".exported-from-drafts"

# culture_key becomes a path component and a token in "CON <key> <id>".
# "", "..", "a/b" or "rapa nui" would escape dest, rmtree it, or split the id.
CULTURE_KEY_RE = re.compile(r"^[a-z0-9_]+$")
DEFAULT_TAXONOMY_PATH = REPO_ROOT / "data" / "taxonomy.json"

# Verbatim wording pinned by the task-8 brief. Do not paraphrase — an
# export that quietly softened or omitted this would misrepresent a
# governance decision that has not been made.
LICENSE_STATEMENT = (
    "License: to be determined by the contributing community "
    "— not yet openly licensed"
)
LICENSE_NOTE = (
    "Content licensing is a Phase 2 governance decision; exports are for "
    "local/demo use until then."
)


class ExportError(RuntimeError):
    """Raised when a culture has nothing exportable, or a draft is
    missing data this module refuses to paper over (e.g. lines)."""


def _slug(name: str) -> str:
    """Turn a draft's English name into the hyphen-joined token used
    inside a Stellarium constellation id, e.g. "Te Manu" -> "Te-Manu".
    Collapses internal whitespace only — never alters casing or wording,
    since the id is meant to be traceable back to the recorded name."""
    return re.sub(r"\s+", "-", name.strip())


def _md_inline(value: Any) -> str:
    """A single-line field (name, provenance, source) as one markdown line.
    Newlines are collapsed so contributor text cannot open a new heading or
    section -- the words are kept, only the structure they could inject is
    not."""
    return re.sub(r"\s+", " ", str(value)).strip()


_HEADING_LINE_RE = re.compile(r"^(\s*)(#|=+\s*$|-{2,}\s*$)")


def _md_block(value: Any) -> str:
    """Free text (notes) with every line that markdown would read as a
    heading escaped. A note containing "## License" otherwise became the
    culture's licence in deploy/generate_attribution.py: one contributor
    asserting a licence on a community's behalf."""
    return "\n".join(
        _HEADING_LINE_RE.sub(lambda m: m.group(1) + "\\" + m.group(2), line)
        for line in str(value).strip().splitlines()
    )


def _culture_title(culture_key: str) -> str:
    """Derive a human-readable H1 title from the culture_key alone (e.g.
    "rapa_nui" -> "Rapa Nui"). This is a mechanical formatting of the key
    the caller already provided, not invented cultural content."""
    return culture_key.replace("_", " ").replace("-", " ").title()


def _constellation_id(culture_key: str, draft: dict[str, Any], index: int) -> str:
    name = (draft.get("name_english") or "").strip()
    if name:
        token = _slug(name)
    else:
        # No English name recorded. Fall back to a stable positional
        # token rather than inventing a name for the id.
        token = f"{index:03d}"
    return f"CON {culture_key} {token}"


def _common_name(draft: dict[str, Any]) -> dict[str, str]:
    cn: dict[str, str] = {}
    for key, field in (
        ("english", "name_english"),
        ("native", "name_native"),
        ("pronounce", "pronounce"),
    ):
        value = (draft.get(field) or "").strip()
        if value:
            cn[key] = value
    return cn


def _drafts_for_culture(culture_key: str, drafts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [d for d in drafts if d.get("culture_key") == culture_key]


def _load_taxonomy_regions(taxonomy_path: Path | str) -> dict[str, str]:
    """Build a {culture_key: region} map from data/taxonomy.json's LEAF
    nodes only (the ones with a `skyculture_id`/`region`, no `children`).

    Scoping to leaves is deliberate, not incidental: taxonomy.json has a
    known id collision where `"western"` is BOTH a top-level bucket id
    (`{"id": "western", "children": [...]}`, no `region` field of its
    own) AND the id of the single leaf culture inside that bucket
    (`{"id": "western", "region": "International (Western/IAU
    tradition)"}`). A flat walk over every node keyed by `id` — bucket
    and leaf alike — would let the region-less bucket node clobber (or
    be clobbered by, depending on walk order) the leaf's real region.
    Only ever descending into `bucket["children"]` and reading `id`/
    `region` off of those means the top-level bucket ids are never
    treated as lookup keys at all, so the collision cannot occur.
    """
    taxonomy_path = Path(taxonomy_path)
    if not taxonomy_path.is_file():
        return {}
    with open(taxonomy_path) as f:
        taxonomy = json.load(f)

    regions: dict[str, str] = {}
    for bucket in taxonomy:
        for child in bucket.get("children", []):
            child_id = child.get("id")
            region = child.get("region")
            if child_id and region:
                regions[child_id] = region
    return regions


def build_index(
    culture_key: str,
    drafts: list[dict[str, Any]],
    taxonomy_path: Path | str = DEFAULT_TAXONOMY_PATH,
) -> dict[str, Any]:
    """Build the index.json dict for one culture from its drafts.

    Deliberately omits top-level keys this app has no source data for
    (classification, highlight, thumbnail — all present on real fetched
    cultures, see web/public/skycultures/*/index.json) rather than
    guessing at them. `common_names` (per-star names, distinct from a
    constellation's own common_name) is included as an empty object for
    schema-shape parity with real cultures — drafts carry no per-star
    naming data in Phase 1, so it has nothing to hold yet.

    `region` (a real, non-optional top-level field per docs/DESIGN.md's
    "Verified technical facts") is looked up from data/taxonomy.json,
    keyed by `culture_key` restricted to leaf nodes (see
    `_load_taxonomy_regions`) — every taxonomy leaf, real or placeholder,
    already carries the community/region string a human curated when the
    taxonomy was built, so this is recorded data, not a guess. If
    `culture_key` isn't found there (an export for a culture_key with no
    taxonomy entry at all), `region` is simply omitted, matching this
    function's existing omit-rather-than-invent policy elsewhere in this
    dict — inventing a plausible-sounding geographic attribution would be
    fabricated cultural content, which this module refuses to do.
    """
    culture_drafts = _drafts_for_culture(culture_key, drafts)

    constellations = []
    for i, draft in enumerate(culture_drafts, start=1):
        entry: dict[str, Any] = {"id": _constellation_id(culture_key, draft, i)}

        lines = draft.get("lines") or []
        if lines:
            entry["lines"] = lines
        # A draft with no lines (e.g. a future non-polyline `kind`, per
        # db.py's comment on the Kamilaroi dark-constellation case) is
        # valid and simply omits 'lines' — matching real upstream data
        # (kamilaroi's Gawaargay has no 'lines' key at all).

        common_name = _common_name(draft)
        if common_name:
            entry["common_name"] = common_name

        constellations.append(entry)

    index: dict[str, Any] = {"id": culture_key}

    region = _load_taxonomy_regions(taxonomy_path).get(culture_key)
    if region:
        index["region"] = region

    index["constellations"] = constellations
    index["common_names"] = {}
    return index


def _provenance_bits(provenance: dict[str, Any]) -> list[str]:
    provenance = provenance or {}
    bits = []
    if provenance.get("contributor"):
        bits.append(f"contributed by {provenance['contributor']}")
    if provenance.get("community"):
        bits.append(f"on behalf of {provenance['community']}")
    if provenance.get("permission"):
        bits.append(f"permission: {provenance['permission']}")
    return bits


def build_description(culture_key: str, drafts: list[dict[str, Any]]) -> str:
    """Build description.md text for one culture from its drafts.

    Structure is fixed by the required format: H1 culture name, then H2
    Introduction / Description / Constellations / References / Authors /
    License, in that order (see docs/DESIGN.md and real examples such as
    web/public/skycultures/aztec/description.md, which uses the same H2
    skeleton with H5 per-constellation headings under Constellations).
    Every section is always present, even when there is nothing recorded
    to put in it yet — the section then says so plainly instead of
    inventing filler prose.
    """
    culture_drafts = _drafts_for_culture(culture_key, drafts)
    lines: list[str] = [f"# {_culture_title(culture_key)}", ""]

    # -- Introduction ---------------------------------------------------
    lines += ["## Introduction", ""]
    if culture_drafts:
        n = len(culture_drafts)
        plural = "constellation" if n == 1 else "constellations"
        lines.append(
            f"This sky culture currently has {n} contributed {plural}, "
            "authored through the Indigenous Stellarium platform."
        )
    else:
        lines.append("No introduction has been recorded for this culture yet.")
    lines.append("")

    # -- Description ------------------------------------------------------
    lines += ["## Description", ""]
    if culture_drafts:
        for draft in culture_drafts:
            name = _md_inline(draft.get("name_english") or draft.get("name_native") or "(untitled)")
            notes = _md_block(draft.get("notes") or "")
            if notes:
                lines.append(f"- **{name}** — {notes}")
            else:
                lines.append(f"- **{name}**")
    else:
        lines.append("No constellations have been contributed for this culture yet.")
    lines.append("")

    # -- Constellations ------------------------------------------------
    lines += ["## Constellations", ""]
    if culture_drafts:
        for draft in culture_drafts:
            name = _md_inline(draft.get("name_english") or draft.get("name_native") or "(untitled)")
            lines.append(f"##### {name}")
            lines.append("")
            if draft.get("name_native"):
                lines.append(f"Native name: {_md_inline(draft['name_native'])}")
            if draft.get("pronounce"):
                lines.append(f"Pronunciation: {_md_inline(draft['pronounce'])}")
            notes = _md_block(draft.get("notes") or "")
            if notes:
                lines.append("")
                lines.append(notes)
            lines.append("")
    else:
        lines.append("(none yet)")
        lines.append("")

    # -- References -------------------------------------------------------
    lines += ["## References", ""]
    sources = [
        draft["provenance"]["source"]
        for draft in culture_drafts
        if (draft.get("provenance") or {}).get("source")
    ]
    if sources:
        for source in dict.fromkeys(sources):  # de-dup, keep first-seen order
            lines.append(f"- {_md_inline(source)}")
    else:
        lines.append("No sources recorded.")
    lines.append("")

    # -- Authors ------------------------------------------------------------
    lines += ["## Authors", ""]
    any_author = False
    for draft in culture_drafts:
        name = _md_inline(draft.get("name_english") or draft.get("name_native") or "(untitled)")
        bits = [_md_inline(b) for b in _provenance_bits(draft.get("provenance") or {})]
        if bits:
            any_author = True
            lines.append(f"- **{name}** — {'; '.join(bits)}")
    if not any_author:
        lines.append("No contributors recorded.")
    lines.append("")

    # -- License --------------------------------------------------------
    lines += ["## License", ""]
    lines.append(LICENSE_STATEMENT)
    lines.append("")
    lines.append(LICENSE_NOTE)
    lines.append("")

    return "\n".join(lines)


def export_culture(
    culture_key: str,
    drafts: list[dict[str, Any]],
    dest: Path | str,
    taxonomy_path: Path | str = DEFAULT_TAXONOMY_PATH,
) -> Path:
    """Write dest/<culture_key>/index.json and description.md from the
    drafts matching culture_key (drafts for other cultures in the same
    list are ignored). Returns the culture directory path.

    `taxonomy_path` is forwarded to `build_index` for the `region` lookup
    (see its docstring) and defaults to the repo's real
    `data/taxonomy.json`; overriding it is only for tests.

    Writes are atomic (temp dir, then rename) matching the convention in
    scripts/fetch_skycultures.py, so a failure partway through never
    leaves a half-written culture directory behind.
    """
    if not isinstance(culture_key, str) or not CULTURE_KEY_RE.match(culture_key):
        raise ExportError(
            f"culture_key {culture_key!r} must match {CULTURE_KEY_RE.pattern}"
        )
    dest = Path(dest)
    culture_dest = dest / culture_key
    if culture_dest.exists() and not (culture_dest / EXPORT_SENTINEL).is_file():
        raise ExportError(
            f"{culture_dest} exists and was not written by this exporter "
            f"(no {EXPORT_SENTINEL}). Refusing to replace it -- it may be a "
            "fetched upstream culture."
        )
    tmp_dest = dest / f".{culture_key}.exporting"
    if tmp_dest.exists():
        import shutil

        shutil.rmtree(tmp_dest)
    tmp_dest.mkdir(parents=True)

    try:
        index = build_index(culture_key, drafts, taxonomy_path)
        with open(tmp_dest / "index.json", "w") as f:
            json.dump(index, f, indent=2)
            f.write("\n")

        description = build_description(culture_key, drafts)
        (tmp_dest / "description.md").write_text(description)
        (tmp_dest / EXPORT_SENTINEL).write_text(
            "Written by scripts/export_skyculture.py from contributor drafts.\n"
            "Not upstream data, and not cleared for publication.\n"
        )
    except Exception:
        import shutil

        shutil.rmtree(tmp_dest, ignore_errors=True)
        raise

    if culture_dest.exists():
        import shutil

        shutil.rmtree(culture_dest)
    tmp_dest.rename(culture_dest)
    return culture_dest


def _load_drafts_from_db(db_path: Path) -> list[dict[str, Any]]:
    sys.path.insert(0, str(REPO_ROOT / "backend"))
    import db  # noqa: E402  (backend module, added to sys.path above)

    conn = db.get_connection(db_path)
    db.init_db(conn)
    try:
        return db.list_drafts(conn)
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Export drafts for one culture to a Stellarium-native sky-"
            "culture directory (index.json + description.md)."
        )
    )
    parser.add_argument("--culture", required=True, help="culture_key to export")
    parser.add_argument(
        "--dest",
        type=Path,
        default=DEFAULT_DEST,
        help=f"destination root (default: {DEFAULT_DEST})",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"drafts sqlite path (default: {DEFAULT_DB_PATH})",
    )
    args = parser.parse_args(argv)

    drafts = _load_drafts_from_db(args.db)
    culture_drafts = _drafts_for_culture(args.culture, drafts)
    if not culture_drafts:
        print(
            f"WARNING: no drafts found for culture_key={args.culture!r} in "
            f"{args.db} — writing an empty (but structurally valid) export",
            file=sys.stderr,
        )

    args.dest.mkdir(parents=True, exist_ok=True)
    culture_dir = export_culture(args.culture, drafts, args.dest)

    n_files = sum(1 for _ in culture_dir.rglob("*") if _.is_file())
    print(f"Wrote {culture_dir} ({n_files} files, {len(culture_drafts)} draft(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
