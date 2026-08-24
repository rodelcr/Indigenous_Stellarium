"""Tests for deploy/filter_taxonomy.py.

The behaviour under test is a publication guard: if it regresses, a public
deploy either offers cultures whose data it does not ship (a broken,
unloadable node) or misrepresents a withheld culture as one with no
recorded knowledge. Both are governance failures, not cosmetic bugs, so
each rule below is pinned individually.
"""
import json
import re
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "deploy"))

from filter_taxonomy import (  # noqa: E402
    assert_no_excluded_ids,
    filter_taxonomy,
    load_exclusions,
)

EXCLUSIONS = {"kamilaroi": "kamilaroi reason", "rapa_nui": "demo reason"}


def sample_taxonomy():
    return [
        {
            "id": "australian",
            "label": "Australian",
            "children": [
                {"id": "kamilaroi", "label": "Kamilaroi", "skyculture_id": "kamilaroi"},
                {"id": "boorong", "label": "Boorong", "skyculture_id": "boorong"},
            ],
        },
        {
            "id": "polynesian",
            "label": "Polynesian",
            "children": [
                {
                    "id": "rapa_nui",
                    "label": "Rapa Nui",
                    "skyculture_id": None,
                    "placeholder": True,
                },
            ],
        },
    ]


def test_excluded_culture_no_longer_points_at_withheld_data():
    out = filter_taxonomy(sample_taxonomy(), EXCLUSIONS)
    kam = out[0]["children"][0]
    assert kam["skyculture_id"] is None


def test_excluded_culture_is_marked_with_its_verbatim_reason():
    out = filter_taxonomy(sample_taxonomy(), EXCLUSIONS)
    kam = out[0]["children"][0]
    assert kam["excluded"] is True
    # Verbatim, never paraphrased -- the reason is shown to the public and
    # says why WE lack permission, not that the community lacks knowledge.
    assert kam["exclusion_reason"] == "kamilaroi reason"


def test_excluded_culture_is_not_deleted_from_the_tree():
    """Quietly removing a community is the wrong answer for a project whose
    premise is visibility, and it would hide an unresolved licence question."""
    out = filter_taxonomy(sample_taxonomy(), EXCLUSIONS)
    assert [c["id"] for c in out[0]["children"]] == ["kamilaroi", "boorong"]
    assert out[0]["children"][0]["label"] == "Kamilaroi"


def test_excluded_culture_is_not_downgraded_to_a_placeholder():
    """`placeholder` means "no dataset yet -- help us build it", which is
    false here: the data exists upstream, we just may not republish it."""
    out = filter_taxonomy(sample_taxonomy(), EXCLUSIONS)
    assert out[0]["children"][0].get("placeholder") is not True


def test_non_excluded_cultures_are_untouched():
    out = filter_taxonomy(sample_taxonomy(), EXCLUSIONS)
    boorong = out[0]["children"][1]
    assert boorong == {"id": "boorong", "label": "Boorong", "skyculture_id": "boorong"}


def test_existing_placeholder_is_left_alone_even_when_listed():
    """rapa_nui is in the exclusion list but has no skyculture_id, so there
    is nothing to withhold and "no dataset yet" is the honest description."""
    out = filter_taxonomy(sample_taxonomy(), EXCLUSIONS)
    rapa = out[1]["children"][0]
    assert rapa.get("excluded") is None
    assert rapa["placeholder"] is True


def test_input_is_not_mutated():
    original = sample_taxonomy()
    filter_taxonomy(original, EXCLUSIONS)
    assert original[0]["children"][0]["skyculture_id"] == "kamilaroi"


def test_assert_no_excluded_ids_rejects_an_unfiltered_tree():
    with pytest.raises(AssertionError, match="kamilaroi"):
        assert_no_excluded_ids(sample_taxonomy(), EXCLUSIONS)


def test_assert_no_excluded_ids_accepts_a_filtered_tree():
    assert_no_excluded_ids(filter_taxonomy(sample_taxonomy(), EXCLUSIONS), EXCLUSIONS)


def test_empty_manifest_raises_rather_than_publishing_everything(tmp_path):
    """An empty exclusion list must never be read as "exclude nothing"."""
    path = tmp_path / "exclusions.json"
    path.write_text(json.dumps({"cultures": []}))
    with pytest.raises(ValueError, match="no cultures"):
        load_exclusions(path)


def test_manifest_entry_without_a_reason_raises(tmp_path):
    path = tmp_path / "exclusions.json"
    path.write_text(json.dumps({"cultures": [{"id": "kamilaroi"}]}))
    with pytest.raises(ValueError, match="missing"):
        load_exclusions(path)


def test_real_manifest_and_real_taxonomy_agree():
    """The shipped taxonomy, filtered by the shipped manifest, must be
    publishable -- this is the check that actually gates a deploy."""
    exclusions = load_exclusions()
    taxonomy = json.loads((REPO_ROOT / "data" / "taxonomy.json").read_text())
    filtered = filter_taxonomy(taxonomy, exclusions)
    assert_no_excluded_ids(filtered, exclusions)
    marked = {
        c["id"]
        for b in filtered
        for c in b.get("children", [])
        if c.get("excluded")
    }
    # Both licence-excluded cultures really are wired into the taxonomy with
    # live skyculture_ids; if that stops being true this test should be
    # updated deliberately, not silently pass.
    assert marked == {"kamilaroi", "lokono"}


class TestBundledSkycultureAllowlist:
    """The engine's own demo data (web/public/skydata/) ships sky cultures,
    and both deploy paths copy that directory wholesale. The exclusion list
    only ever guarded the FETCHED set, so a culture riding along in skydata
    was published unexamined and — because the attribution panel is built
    from the fetched set — with no author or licence shown.

    The `belarusian` culture was in exactly that state on the live site. Its
    own description.md says 'Text and data: TODO', so upstream has not
    determined a licence for it; republishing it asserted one on its authors'
    behalf, which is the single thing this project must never do.
    """

    def test_manifest_declares_an_allowlist(self):
        data = json.loads((REPO_ROOT / "deploy" / "exclusions.json").read_text())
        allowed = data.get("bundled_skycultures_allowed")
        assert allowed, "exclusions.json must declare bundled_skycultures_allowed"
        assert isinstance(allowed, list)

    def test_allowlist_matches_what_the_app_actually_boots(self):
        """An allowlist wider than the set engine.js loads would republish a
        culture nothing can display and nothing credits."""
        data = json.loads((REPO_ROOT / "deploy" / "exclusions.json").read_text())
        allowed = set(data["bundled_skycultures_allowed"])
        engine_js = (REPO_ROOT / "web" / "src" / "engine.js").read_text()
        booted = set(re.findall(r"skycultures/(\w+)', key: '(?:\w+)'", engine_js))
        assert allowed == booted, (
            f"allowlist {sorted(allowed)} does not match the cultures engine.js "
            f"boots {sorted(booted)} — one of the two changed without the other"
        )

    def test_belarusian_is_not_allowlisted(self):
        """Regression pin for the specific culture that shipped unattributed
        with an undetermined upstream licence."""
        data = json.loads((REPO_ROOT / "deploy" / "exclusions.json").read_text())
        assert "belarusian" not in data["bundled_skycultures_allowed"]

    def test_both_deploy_paths_filter_the_taxonomy(self):
        """Excluding a culture's directory is only half the job: a tree node
        still carrying its skyculture_id renders as a clickable culture that
        404s and shows nothing. assemble.sh bare-copied the taxonomy while
        pages.sh filtered it, so the container deploy really did offer
        kamilaroi and lokono as dead entries."""
        for script in ("pages.sh", "assemble.sh"):
            text = (REPO_ROOT / "deploy" / script).read_text()
            assert "filter_taxonomy.py" in text, (
                f"deploy/{script} ships a taxonomy without filtering it"
            )

    def test_no_deploy_path_reads_the_generated_taxonomy_copy(self):
        """web/public/taxonomy.json is a generated copy that drifts from the
        hand-authored data/taxonomy.json -- they were out of sync when this
        was found, the copy missing the yana_phuyu node."""
        for script in ("pages.sh", "assemble.sh"):
            text = (REPO_ROOT / "deploy" / script).read_text()
            # Only a READ of the repo copy is a problem. Writing to
            # "$OUT/web/public/taxonomy.json" is fine -- the payload
            # deliberately mirrors the repo layout.
            assert "$REPO_ROOT/web/public/taxonomy.json" not in text, (
                f"deploy/{script} reads the generated taxonomy copy, which "
                "drifts from the hand-authored data/taxonomy.json"
            )

    def test_both_deploy_paths_prune_bundled_cultures(self):
        """A guard applied to one deploy path and not the other would look
        fine while still publishing the content from the other."""
        for script in ("pages.sh", "assemble.sh"):
            text = (REPO_ROOT / "deploy" / script).read_text()
            assert "prune_bundled_skycultures" in text, (
                f"deploy/{script} copies skydata but never prunes it"
            )
