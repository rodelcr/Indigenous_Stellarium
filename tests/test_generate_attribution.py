"""Unit tests for deploy/generate_attribution.py.

build_attribution(dir) is deliberately filesystem-only (a directory of
description.md files in, a list of dicts out) — no network, no backend,
no engine. These tests build small fake description.md fixtures rather
than depending on the real (network-fetched) web/public/skycultures/
content, so they run offline and don't couple to upstream text changing.
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "deploy"))

from generate_attribution import build_attribution, parse_description  # noqa: E402

MAORI_LIKE = """# Maori

## Introduction

Some introduction text.

## Description

Some description text.

## References

 - [#1]: some reference

## Authors

This sky culture is a contribution of Stellarium user [Dan
Smale](mailto:d.smale@niwa.co.nz)

## License

Text and lines: CC BY-SA
"""

NO_AUTHORS_OR_LICENSE = """# Placeholder

## Introduction

Nothing else here.
"""


def test_parse_description_extracts_title_authors_license():
    parsed = parse_description(MAORI_LIKE)
    assert parsed["title"] == "Maori"
    assert "Dan" in parsed["authors_md"]
    assert "d.smale@niwa.co.nz" in parsed["authors_md"]
    assert parsed["license_md"] == "Text and lines: CC BY-SA"


def test_parse_description_missing_sections_are_none_not_fabricated():
    parsed = parse_description(NO_AUTHORS_OR_LICENSE)
    assert parsed["title"] == "Placeholder"
    assert parsed["authors_md"] is None
    assert parsed["license_md"] is None


def test_build_attribution_walks_directory_and_sorts_by_id():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "maori").mkdir()
        (root / "maori" / "description.md").write_text(MAORI_LIKE, encoding="utf-8")
        (root / "aztec").mkdir()
        (root / "aztec" / "description.md").write_text(
            "# Aztec\n\n## Authors\n\nSome authors.\n\n## License\n\nCC BY-SA\n",
            encoding="utf-8",
        )
        # A non-directory entry alongside the culture dirs should be
        # ignored, not crash the walk.
        (root / "stray_file.txt").write_text("not a culture", encoding="utf-8")

        records = build_attribution(root)

        assert [r["id"] for r in records] == ["aztec", "maori"]
        maori_record = next(r for r in records if r["id"] == "maori")
        assert maori_record["title"] == "Maori"
        assert "Dan" in maori_record["authors_md"]
        assert maori_record["license_md"] == "Text and lines: CC BY-SA"


def test_build_attribution_skips_directory_with_no_description_md():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "no_description").mkdir()

        records = build_attribution(root)

        assert records == []


def test_build_attribution_never_invents_missing_authors_or_license():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "placeholder").mkdir()
        (root / "placeholder" / "description.md").write_text(
            NO_AUTHORS_OR_LICENSE, encoding="utf-8"
        )

        records = build_attribution(root)

        assert len(records) == 1
        assert records[0]["authors_md"] is None
        assert records[0]["license_md"] is None


# --- origin: fetched vs authored ----------------------------------------
# The attribution panel used to say every culture came from
# stellarium-skycultures and "None of it is written by us". Osage ships and
# was compiled by this project (data/skycultures_authored/osage), so each
# record now says where it came from and the panel words its note from that.

def _write_culture(root: Path, cid: str) -> None:
    (root / cid).mkdir()
    (root / cid / "description.md").write_text(
        f"# {cid}\n\n## Authors\n\nA.\n\n## License\n\nL.\n", encoding="utf-8"
    )


def test_build_attribution_marks_authored_vs_fetched_origin():
    with tempfile.TemporaryDirectory() as tmp:
        shipped = Path(tmp) / "skycultures"
        authored = Path(tmp) / "authored"
        shipped.mkdir()
        authored.mkdir()
        _write_culture(shipped, "maori")
        _write_culture(shipped, "osage")
        (authored / "osage").mkdir()
        # A stray FILE named like a culture is not an authored culture.
        (authored / "maori").write_text("not a directory", encoding="utf-8")

        records = build_attribution(shipped, authored_dir=authored)

        origin = {r["id"]: r["origin"] for r in records}
        assert origin == {"maori": "fetched", "osage": "authored"}


def test_build_attribution_missing_authored_dir_means_all_fetched():
    with tempfile.TemporaryDirectory() as tmp:
        shipped = Path(tmp) / "skycultures"
        shipped.mkdir()
        _write_culture(shipped, "maori")

        records = build_attribution(shipped, authored_dir=Path(tmp) / "nope")

        assert records[0]["origin"] == "fetched"


def test_build_attribution_default_authored_dir_is_the_repo_one():
    # The default must be the real data/skycultures_authored, since
    # deploy/build_static.sh calls this without passing one. osage lives there.
    with tempfile.TemporaryDirectory() as tmp:
        shipped = Path(tmp)
        _write_culture(shipped, "osage")
        _write_culture(shipped, "maori")

        origin = {r["id"]: r["origin"] for r in build_attribution(shipped)}

        assert origin == {"maori": "fetched", "osage": "authored"}


def test_build_attribution_marks_exported_drafts():
    """An export of contributor drafts is neither upstream nor compiled here;
    calling it 'fetched' put it under the stellarium-skycultures note."""
    with tempfile.TemporaryDirectory() as tmp:
        shipped = Path(tmp)
        _write_culture(shipped, "rapa_nui")
        (shipped / "rapa_nui" / ".exported-from-drafts").write_text("")

        records = build_attribution(shipped, authored_dir=Path(tmp) / "nope")

        assert records[0]["origin"] == "exported"


def test_engine_data_lists_only_what_ships_and_names_no_one():
    """The engine's bundled demo data shipped with no credit at all. The
    record says what each shipped path is and nothing about who made it:
    upstream states no per-asset credit, and naming a source we cannot verify
    is the fabricated-attribution failure."""
    from generate_attribution import ENGINE_DATA_LABELS, build_engine_data

    with tempfile.TemporaryDirectory() as tmp:
        sd = Path(tmp)
        (sd / "stars").mkdir()
        (sd / "mpcorb.dat").write_text("")
        (sd / "surveys" / "milkyway").mkdir(parents=True)
        (sd / "skycultures").mkdir()

        record = build_engine_data(sd)

    assert [i["path"] for i in record["items"]] == ["mpcorb.dat", "stars", "surveys/milkyway"]
    assert all(i["label"] == ENGINE_DATA_LABELS[i["path"]] for i in record["items"])
    assert record["credit_stated"] is False
    assert "stellarium-web-engine" in record["source"]


def test_engine_data_labels_cover_the_manifest():
    import json as _json

    from generate_attribution import ENGINE_DATA_LABELS

    m = _json.loads((Path(__file__).resolve().parents[1] / "deploy" / "exclusions.json").read_text())
    named = set(m["bundled_engine_data"]["top_level"]) | {
        f"surveys/{s}" for s in m["bundled_engine_data"]["surveys"]
    }
    assert named == set(ENGINE_DATA_LABELS)
