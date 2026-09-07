"""The Ojibwe and D(L)akota sky cultures assembled from the open-access
Native Skywatchers papers.

These tests exist to pin the things that are easy to break by accident and
expensive to break in public:

  * **No geometry, ever.** Neither paper publishes star lists — the shapes
    live only in copyrighted map artwork. A well-meaning future edit that
    "fills in the lines" from the Greek cross-references would be fabricated
    cultural content, which is the one failure this project must not have.
  * **A figure's name is not each member star's name.** The Osage entry
    shipped that bug once.
  * **Neither culture is in the public deploy** while consent is unasked.
"""
import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
AUTHORED = REPO_ROOT / "data" / "skycultures_authored"
CULTURES = ("ojibwe", "dakota")

REQUIRED_SECTIONS = (
    "## Introduction",
    "## Description",
    "## Constellations",
    "## References",
    "## Authors",
    "## License",
)


@pytest.fixture(scope="module", params=CULTURES)
def culture(request):
    cid = request.param
    index = json.loads((AUTHORED / cid / "index.json").read_text(encoding="utf-8"))
    assert index["id"] == cid
    return cid, index


def test_no_constellation_carries_line_geometry(culture):
    """The papers publish names, not star lists. Drawing an outline from a
    'Leo, Hydra' cross-reference would be an invention under a nation's name.
    """
    cid, index = culture
    drawn = [c["id"] for c in index["constellations"] if c.get("lines")]
    assert drawn == [], (
        f"{cid}: constellation lines appeared for {drawn}. No line geometry is "
        "published in the open-access Native Skywatchers papers -- see "
        "data/skycultures_authored/%s/description.md. If geometry has since been "
        "obtained WITH PERMISSION, update that file and this test together." % cid
    )


def test_every_figure_has_a_native_name_and_a_translation(culture):
    cid, index = culture
    for con in index["constellations"]:
        name = con["common_name"]
        assert name.get("native", "").strip(), f"{cid}: {con['id']} has no native name"
        assert name.get("english", "").strip(), f"{cid}: {con['id']} has no translation"


def test_object_names_are_not_constellation_names(culture):
    """A figure's name belongs to the figure, not to each of its stars."""
    cid, index = culture
    figure_names = {
        c["common_name"]["native"].strip() for c in index["constellations"]
    }
    for key, entries in index.get("common_names", {}).items():
        for entry in entries:
            assert entry["native"].strip() not in figure_names, (
                f"{cid}: {key} is labelled '{entry['native']}', which is also a "
                "constellation name. Naming every member star after its figure is "
                "the bug the Osage entry shipped once."
            )


def test_object_name_keys_are_conventional(culture):
    """`NAME Pleiades` and `HIP nnn` -- the keys the engine actually resolves."""
    cid, index = culture
    for key in index.get("common_names", {}):
        assert key.startswith("HIP ") or key.startswith("NAME "), (
            f"{cid}: unrecognised common_names key {key!r}"
        )
        if key.startswith("HIP "):
            int(key.split()[1])  # raises if not a catalogue number


def test_description_has_the_six_required_sections(culture):
    cid, _ = culture
    text = (AUTHORED / cid / "description.md").read_text(encoding="utf-8")
    for section in REQUIRED_SECTIONS:
        assert section in text, f"{cid}: description.md missing {section}"


def test_description_asserts_no_licence(culture):
    """Never assert a licence on a community's behalf."""
    cid, _ = culture
    text = (AUTHORED / cid / "description.md").read_text(encoding="utf-8")
    assert "To be determined by" in text
    assert "asserts no licence" in text


@pytest.mark.parametrize("cid", CULTURES)
def test_not_in_the_public_deploy_while_consent_is_unasked(cid):
    manifest = json.loads(
        (REPO_ROOT / "deploy" / "exclusions.json").read_text(encoding="utf-8")
    )
    assert cid not in manifest["authored_skycultures_published"], (
        f"{cid} is allowlisted for publication. Consent has not been asked -- see "
        "docs/NATIVE_SKYWATCHERS_REQUEST.md. Publishing is a deliberate act and "
        "this test should be deleted in the same commit that makes it."
    )
    excluded = {c["id"]: c for c in manifest["cultures"]}
    assert cid in excluded, (
        f"{cid} is neither published nor excluded, so a public taxonomy would "
        "offer a culture whose data does not ship -- the kamilaroi dead-link bug."
    )
    assert excluded[cid]["reason"].strip()
