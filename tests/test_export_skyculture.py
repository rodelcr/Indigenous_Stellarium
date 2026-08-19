"""Unit tests for scripts/export_skyculture.py.

export_culture(culture_key, drafts, dest) is deliberately DB-free — it
takes drafts as plain dicts (the same shape db.list_drafts()/DraftOut
returns) so these tests need no sqlite file and no backend running. That
is the whole point of the interface: exportability is testable in
isolation from persistence.

These tests check two things the task brief calls out specifically:

1. The generated index.json matches the schema documented in
   docs/DESIGN.md's "Verified technical facts" (id / constellation id
   shape / lines / common_name), diffed structurally against a real
   fetched culture (web/public/skycultures/maori/index.json) elsewhere
   in the report — here we assert the concrete shape the brief pins.
2. description.md carries every draft's provenance forward (contributor,
   community, source, permission) rather than dropping it, and states
   the license honestly — "to be determined by the contributing
   community", never an asserted license like CC BY-SA on a community's
   behalf.
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from export_skyculture import export_culture  # noqa: E402

FULL_PROVENANCE = {
    "contributor": "Jane Contributor",
    "community": "Example Community",
    "source": "Interview with elder, 2024",
    "permission": "Shared for educational, non-commercial use",
}

TE_MANU_DRAFT = {
    "id": 1,
    "culture_key": "rapa_nui",
    "name_english": "Te Manu",
    "name_native": "",
    "pronounce": "",
    "lines": [[68702, 71683]],
    "notes": "The Bird constellation.",
    "provenance": FULL_PROVENANCE,
    "status": "draft",
    "kind": "polyline",
    "created_at": "2026-08-13T00:00:00+00:00",
    "updated_at": "2026-08-13T00:00:00+00:00",
}

REQUIRED_H2_SECTIONS = [
    "Introduction",
    "Description",
    "Constellations",
    "References",
    "Authors",
    "License",
]

LICENSE_STATEMENT = (
    "License: to be determined by the contributing community "
    "— not yet openly licensed"
)


def test_export_culture_writes_index_json_matching_brief_shape():
    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp)

        culture_dir = export_culture("rapa_nui", [TE_MANU_DRAFT], dest)

        index_path = culture_dir / "index.json"
        assert index_path.is_file(), f"expected {index_path} to exist"

        with open(index_path) as f:
            data = json.load(f)

        assert data["id"] == "rapa_nui"

        constellations = data["constellations"]
        assert isinstance(constellations, list)
        assert len(constellations) == 1

        con = constellations[0]
        assert con["id"] == "CON rapa_nui Te-Manu"
        assert con["lines"] == [[68702, 71683]]
        assert con["common_name"]["english"] == "Te Manu"


def test_export_culture_writes_description_md_with_required_sections():
    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp)

        culture_dir = export_culture("rapa_nui", [TE_MANU_DRAFT], dest)

        description_path = culture_dir / "description.md"
        assert description_path.is_file(), f"expected {description_path} to exist"

        text = description_path.read_text()

        assert text.startswith("# "), "description.md must start with an H1"

        for section in REQUIRED_H2_SECTIONS:
            assert f"## {section}" in text, f"missing required H2 section: {section}"


def test_export_culture_carries_provenance_into_description_md():
    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp)

        culture_dir = export_culture("rapa_nui", [TE_MANU_DRAFT], dest)
        text = (culture_dir / "description.md").read_text()

        # References/Authors sections must carry the actual recorded
        # provenance forward verbatim -- not summarised, not dropped.
        for value in FULL_PROVENANCE.values():
            assert value in text, f"provenance value dropped from export: {value!r}"


def test_export_culture_license_section_is_honest_not_asserted():
    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp)

        culture_dir = export_culture("rapa_nui", [TE_MANU_DRAFT], dest)
        text = (culture_dir / "description.md").read_text()

        assert LICENSE_STATEMENT in text
        # Must NOT assert a license on the community's behalf.
        assert "CC BY-SA" not in text
        assert "CC-BY" not in text


def test_export_culture_only_includes_drafts_for_the_given_culture():
    other_draft = dict(TE_MANU_DRAFT)
    other_draft["culture_key"] = "some_other_culture"
    other_draft["name_english"] = "Should Not Appear"

    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp)

        culture_dir = export_culture(
            "rapa_nui", [TE_MANU_DRAFT, other_draft], dest
        )
        with open(culture_dir / "index.json") as f:
            data = json.load(f)

        names = [c["common_name"]["english"] for c in data["constellations"]]
        assert names == ["Te Manu"]


def test_export_culture_does_not_invent_content_for_missing_fields():
    minimal_draft = {
        "id": 2,
        "culture_key": "rapa_nui",
        "name_english": "",
        "name_native": "",
        "pronounce": "",
        "lines": [[1, 2]],
        "notes": "",
        "provenance": {
            "contributor": "",
            "community": "",
            "source": "",
            "permission": "",
        },
        "status": "draft",
        "kind": "polyline",
        "created_at": "2026-08-13T00:00:00+00:00",
        "updated_at": "2026-08-13T00:00:00+00:00",
    }

    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp)

        culture_dir = export_culture("rapa_nui", [minimal_draft], dest)
        with open(culture_dir / "index.json") as f:
            data = json.load(f)

        con = data["constellations"][0]
        # No fabricated english/native/pronounce name for a draft that
        # never recorded one.
        assert "common_name" not in con or con["common_name"] == {}
