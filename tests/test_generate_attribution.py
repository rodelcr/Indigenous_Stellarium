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
