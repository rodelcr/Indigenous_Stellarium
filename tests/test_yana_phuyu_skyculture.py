"""Shape tests for the Yana Phuyu authored sky culture.

Yana Phuyu (Andean "dark cloud" constellations) is the first sky culture
AUTHORED inside this project rather than fetched verbatim from Stellarium's
repository, so it lives in version control under
`data/skycultures_authored/`, not in the git-ignored
`web/public/skycultures/` tree that holds third-party content.

These tests do not — and cannot — check that the cultural content is
correct; that is what community review is for. What they DO check is the
set of properties that make the file honest, because those are exactly the
ones a careless later edit would silently break:

1. The taxonomy entry exists, sits under South American, and is a
   placeholder (`skyculture_id: null`). The culture carries no geometry,
   so wiring it up as a loadable dataset would advertise a culture that
   renders nothing.
2. No constellation entry has `lines` or `image`. Dark cloud figures are
   dust silhouettes; no consulted source publishes star-level membership
   for any of them, so any geometry here would be invented. Kamilaroi is
   the structural precedent for a constellation with no `lines` — this
   goes one step further and has no artwork either.
3. Only the two star names actually attested in the literature (alpha and
   beta Centauri as *llamacñawin*) appear in `common_names`.
4. description.md has the six required H2 sections and states the license
   honestly rather than asserting one on a community's behalf.

The taxonomy lookup below is deliberately scoped to `children` only.
`data/taxonomy.json` has a known id collision — "western" is both a
top-level bucket id and the id of the single leaf inside it — so a flat
id->node map built across buckets and children is wrong by construction.
"""
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TAXONOMY_PATH = REPO_ROOT / "data" / "taxonomy.json"
CULTURE_DIR = REPO_ROOT / "data" / "skycultures_authored" / "yana_phuyu"

REQUIRED_SECTIONS = [
    "## Introduction",
    "## Description",
    "## Constellations",
    "## References",
    "## Authors",
    "## License",
]


def _leaf(taxonomy, leaf_id):
    """Find a leaf node by id, scanning children only (see module docstring)."""
    for bucket in taxonomy:
        for child in bucket.get("children", []):
            if child["id"] == leaf_id:
                return bucket, child
    raise AssertionError(f"no taxonomy leaf with id {leaf_id!r}")


def test_taxonomy_has_yana_phuyu_placeholder_under_south_american():
    taxonomy = json.loads(TAXONOMY_PATH.read_text())
    bucket, node = _leaf(taxonomy, "yana_phuyu")

    assert bucket["id"] == "south_american"
    assert node["placeholder"] is True
    assert node["skyculture_id"] is None
    assert node["label"]
    assert node["region"]


def test_taxonomy_ids_unique_within_each_bucket():
    # Guards the collision gotcha at the level where it actually matters:
    # ids must be unique among a bucket's children even though a leaf id
    # may legitimately repeat a bucket id ("western").
    taxonomy = json.loads(TAXONOMY_PATH.read_text())
    for bucket in taxonomy:
        ids = [child["id"] for child in bucket.get("children", [])]
        assert len(ids) == len(set(ids)), f"duplicate leaf ids in {bucket['id']}"


def test_index_json_is_valid_and_carries_no_invented_geometry():
    index = json.loads((CULTURE_DIR / "index.json").read_text())

    assert index["id"] == "yana_phuyu"
    assert index["region"]
    assert index["constellations"]

    for con in index["constellations"]:
        assert con["id"].startswith("CON yana_phuyu ")
        assert con["common_name"]["english"]
        assert con["common_name"]["native"]
        # The whole point: no fabricated outlines, no fabricated artwork.
        assert "lines" not in con
        assert "image" not in con


def test_common_names_only_hold_the_two_attested_star_names():
    index = json.loads((CULTURE_DIR / "index.json").read_text())

    # alpha Centauri A and beta Centauri, the "eyes of the llama".
    # HIP ids resolved via SIMBAD, not from memory.
    assert set(index["common_names"]) == {"HIP 71683", "HIP 68702"}
    for entries in index["common_names"].values():
        assert len(entries) == 1
        assert entries[0]["native"] == "Llamacñawin"


def test_description_has_required_sections_and_honest_license():
    text = (CULTURE_DIR / "description.md").read_text()

    assert text.startswith("# Yana Phuyu")
    for section in REQUIRED_SECTIONS:
        assert section in text, f"missing {section}"

    assert "to be determined by the contributing community" in text
    # Must not assert a license on a community's behalf.
    assert "CC BY-SA" not in text
    assert "CC-BY" not in text

    # Must be plainly marked as an unreviewed, literature-derived draft.
    assert "literature-derived draft" in text
    # Line-wrap-insensitive: the draft notice must say community sources win.
    collapsed = " ".join(text.split())
    assert "community sources supersede it" in collapsed
    assert "has not been reviewed by Quechua" in collapsed


def test_every_constellation_has_a_heading_in_description():
    index = json.loads((CULTURE_DIR / "index.json").read_text())
    text = (CULTURE_DIR / "description.md").read_text()

    for con in index["constellations"]:
        native = con["common_name"]["native"]
        assert f"##### {native}" in text, f"no H5 section for {native}"
