#!/usr/bin/env python3
"""verify_bundle.py — the one check a built bundle must pass before it can go
public. Run by deploy/build_static.sh on its output, and again by
deploy/publish_pages.sh and deploy/publish_space.sh on the bundle they are
about to push, so a bundle built under an older exclusion list, or from
another commit, cannot be published.

It inspects the ARTIFACT, never the intent. Every path in the bundle that can
carry cultural or third-party content must be accounted for by
deploy/exclusions.json:

  skycultures/         exactly fetched_skycultures_published
                       + authored_skycultures_published — an ALLOWLIST. The
                       fetched folder (web/public/skycultures) is also fed by
                       dev staging and, until 2026-10-05, by the exporter, so
                       a denylist let a stale or exported draft ship with
                       every other check passing.
  skydata/skycultures  bundled_skycultures_allowed (+ known loose files)
  skydata/surveys      not withheld, and credited (a real, non-empty
                       hips_creator / obs_copyright / obs_ack) or listed as
                       bundled engine data
  skydata/*            listed as bundled engine data, or one of the above

plus: taxonomy points only at shipped data; attribution covers exactly the
shipped cultures, each with an Authors and a License section and no TODO
licence; the AGPL-3.0 source link is in the bundle; index.html uses the
expected base path; and build.json says the bundle was built from this
manifest (and, when publishing, this clean commit).

Usage:
  verify_bundle.py <bundle_dir> [--manifest PATH] [--base /x/]
                   [--source-url URL] [--expect-sha SHA]
Exit 0 and one summary line on success; exit 1 with every error otherwise.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from generate_attribution import build_survey_attribution  # noqa: E402

DEFAULT_MANIFEST = SCRIPT_DIR / "exclusions.json"
# Must match scripts/export_skyculture.py's EXPORT_SENTINEL.
EXPORT_SENTINEL = ".exported-from-drafts"
GUARDED_SKYDATA = {"skycultures", "surveys"}


def _shipped_cultures(skycultures: Path, errors: list[str]) -> set[str]:
    shipped = set()
    for p in sorted(skycultures.iterdir()):
        if not p.is_dir() or p.name.startswith("."):
            errors.append(
                f"skycultures/{p.name}: not a culture directory — nothing may "
                "ship in skycultures/ that the manifest does not name"
            )
            continue
        shipped.add(p.name)
    return shipped


def verify_bundle(
    out: Path,
    manifest_path: Path = DEFAULT_MANIFEST,
    *,
    base: str | None = None,
    source_url: str | None = None,
    expect_sha: str | None = None,
) -> list[str]:
    out = Path(out)
    manifest_path = Path(manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    excluded = {c["id"] for c in manifest.get("cultures") or []}
    fetched = set(manifest.get("fetched_skycultures_published") or [])
    authored = set(manifest.get("authored_skycultures_published") or [])
    if not fetched:
        errors.append("exclusions.json: fetched_skycultures_published is empty or missing")
    for name, ids in (("fetched_skycultures_published", fetched),
                      ("authored_skycultures_published", authored)):
        for c in sorted(ids & excluded):
            errors.append(f"exclusions.json: '{c}' is in both {name} and the excluded cultures")

    # --- skycultures: exactly the allowlist ---------------------------------
    sc = out / "skycultures"
    if not sc.is_dir():
        errors.append("skycultures/ is missing from the bundle")
        shipped: set[str] = set()
    else:
        shipped = _shipped_cultures(sc, errors)
        allowed = fetched | authored
        for c in sorted(shipped & excluded):
            errors.append(f"skycultures/{c}: an EXCLUDED culture is in the bundle")
        for c in sorted(shipped - allowed - excluded):
            errors.append(
                f"skycultures/{c}: not in fetched_skycultures_published or "
                "authored_skycultures_published — a stale dev copy or an export?"
            )
        for c in sorted(allowed - shipped):
            errors.append(f"skycultures/{c}: allowlisted but missing from the bundle")
        for c in sorted(shipped):
            if (sc / c / EXPORT_SENTINEL).exists():
                errors.append(
                    f"skycultures/{c}: carries {EXPORT_SENTINEL} — exported "
                    "contributor drafts, not upstream or cleared data"
                )

    # --- taxonomy -----------------------------------------------------------
    tax_path = out / "taxonomy.json"
    if not tax_path.is_file():
        errors.append("taxonomy.json is missing from the bundle")
    else:
        taxonomy = json.loads(tax_path.read_text(encoding="utf-8"))
        for b in taxonomy:
            for c in b.get("children", []):
                sid = c.get("skyculture_id")
                if sid and sid not in shipped:
                    errors.append(
                        f"taxonomy.json: '{c.get('id')}' points at '{sid}', "
                        "which is not in the bundle"
                    )

    # --- attribution: complete, not just id-matched -------------------------
    att_path = out / "attribution.json"
    if not att_path.is_file():
        errors.append("attribution.json is missing from the bundle")
    else:
        att = json.loads(att_path.read_text(encoding="utf-8"))
        records = att["cultures"] if isinstance(att, dict) else att
        attributed = {r["id"] for r in records}
        if attributed != shipped:
            errors.append(
                "attribution.json does not match the shipped cultures "
                f"(only in bundle: {sorted(shipped - attributed)}; "
                f"only in attribution: {sorted(attributed - shipped)})"
            )
        for r in records:
            if not (r.get("license_md") or "").strip():
                errors.append(f"attribution: '{r['id']}' has no licence section")
            elif "TODO" in r["license_md"]:
                errors.append(f"attribution: '{r['id']}' licence reads TODO")
            if not (r.get("authors_md") or "").strip():
                errors.append(f"attribution: '{r['id']}' has no authors section")
        # The engine's bundled data must be credited for everything that ships.
        sd_out = out / "skydata"
        if sd_out.is_dir():
            engine_listed = set((manifest.get("bundled_engine_data") or {}).get("top_level") or []) | {
                f"surveys/{x}" for x in
                (manifest.get("bundled_engine_data") or {}).get("surveys") or []
            }
            shipped_engine = {p for p in engine_listed if (sd_out / p).exists()}
            credited_engine = {
                i["path"] for i in (att.get("engine_data") or {}).get("items", [])
            } if isinstance(att, dict) else set()
            for p in sorted(shipped_engine - credited_engine):
                errors.append(
                    f"attribution: bundled engine data skydata/{p} ships but the "
                    "panel's 'Engine and sky data' section does not list it"
                )

    # --- skydata: every entry accounted for ---------------------------------
    engine = manifest.get("bundled_engine_data") or {}
    sd = out / "skydata"
    if sd.is_dir():
        known = GUARDED_SKYDATA | set(engine.get("top_level") or [])
        for p in sorted(sd.iterdir()):
            if p.name not in known:
                errors.append(
                    f"skydata/{p.name}: not listed in bundled_engine_data — "
                    "unexamined content would ship"
                )
        bsc = sd / "skycultures"
        if bsc.is_dir():
            bundled_ok = set(manifest.get("bundled_skycultures_allowed") or [])
            files_ok = set(engine.get("skycultures_files") or [])
            for p in sorted(bsc.iterdir()):
                ok = p.name in bundled_ok if p.is_dir() else p.name in files_ok
                if not ok:
                    errors.append(
                        f"skydata/skycultures/{p.name}: not allowed — published "
                        "with no credit shown"
                    )
        surveys = sd / "surveys"
        if surveys.is_dir():
            withheld = set(manifest.get("withheld_surveys") or [])
            listed = set(engine.get("surveys") or [])
            credited = {r["id"] for r in build_survey_attribution(sd) if r["credited"]}
            for p in sorted(surveys.iterdir()):
                if p.name in withheld:
                    errors.append(f"skydata/surveys/{p.name}: a WITHHELD survey is in the bundle")
                elif p.name not in credited and p.name not in listed:
                    errors.append(
                        f"skydata/surveys/{p.name}: states no credit (hips_creator, "
                        "obs_copyright or obs_ack) and is not listed in "
                        "bundled_engine_data"
                    )

    # --- index, AGPL link, cities -------------------------------------------
    index_path = out / "index.html"
    if not index_path.is_file():
        errors.append("index.html is missing from the bundle")
    elif base is not None:
        index = index_path.read_text(encoding="utf-8")
        if f'src="{base}assets/' not in index and f"src='{base}assets/" not in index:
            errors.append(f"index.html does not reference the base path {base!r}")
    if source_url is not None:
        bundle_js = "".join(p.read_text(encoding="utf-8")
                            for p in (out / "assets").glob("*.js"))
        if source_url not in bundle_js:
            errors.append(
                f"the AGPL source link {source_url!r} is not in the built bundle "
                "(AGPL-3.0 section 13)"
            )
    if not (out / "cities.json").is_file():
        errors.append("cities.json is missing — the place search would fail silently")

    # --- build stamp ----------------------------------------------------------
    stamp_path = out / "build.json"
    if not stamp_path.is_file():
        errors.append("build.json is missing — cannot tell what built this bundle")
    else:
        stamp = json.loads(stamp_path.read_text(encoding="utf-8"))
        current = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
        if stamp.get("exclusions_sha256") != current:
            errors.append(
                "build.json: bundle was built under a different exclusions.json — rebuild"
            )
        if expect_sha is not None:
            if stamp.get("source_sha") != expect_sha:
                errors.append(
                    f"build.json: bundle was built from commit {stamp.get('source_sha')}, "
                    f"not {expect_sha} — rebuild"
                )
            if stamp.get("dirty"):
                errors.append(
                    "build.json: bundle was built from a dirty tree, so the AGPL "
                    "source link does not point at its source — rebuild from a clean commit"
                )

    return errors


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("bundle", type=Path)
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--base")
    ap.add_argument("--source-url")
    ap.add_argument("--expect-sha")
    args = ap.parse_args(argv)
    errors = verify_bundle(args.bundle, args.manifest, base=args.base,
                           source_url=args.source_url, expect_sha=args.expect_sha)
    if errors:
        for e in errors:
            print(f"verify_bundle: ERROR: {e}", file=sys.stderr)
        print(f"verify_bundle: REFUSING — {len(errors)} problem(s) in {args.bundle}",
              file=sys.stderr)
        return 1
    n = len([p for p in (args.bundle / "skycultures").iterdir() if p.is_dir()])
    print(f"verify_bundle: {args.bundle} verified — {n} cultures, all allowlisted "
          "and attributed; skydata accounted for; build stamp matches")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
