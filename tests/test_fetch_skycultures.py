"""Integration test for scripts/fetch_skycultures.py.

This is a genuine network integration test, not a mocked unit test — see
the controller decision in the task brief: a test that silently passes
when the network is down is worse than one that fails loudly. It hits
the real stellarium-skycultures GitHub repo and asserts on real content.
If you're offline, this test SHOULD fail (loudly), not skip silently.
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from fetch_skycultures import fetch_culture  # noqa: E402


def test_fetch_culture_maori_writes_valid_index_json():
    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp)

        culture_dir = fetch_culture("maori", dest)

        index_path = culture_dir / "index.json"
        assert index_path.is_file(), f"expected {index_path} to exist"

        with open(index_path) as f:
            data = json.load(f)

        assert data["id"] == "maori"

        constellations = data["constellations"]
        assert isinstance(constellations, list)
        assert len(constellations) > 0

        for con in constellations:
            lines = con["lines"]
            assert isinstance(lines, list)
            assert len(lines) > 0
            for polyline in lines:
                assert isinstance(polyline, list)
                assert len(polyline) > 0
                for hip in polyline:
                    assert isinstance(hip, int)
