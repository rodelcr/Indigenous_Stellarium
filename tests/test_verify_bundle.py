"""Tests for deploy/verify_bundle.py — the one check that build_static.sh
and both publishers run against a built bundle before it can go public.

Each test builds a minimal bundle that passes, breaks exactly one thing, and
asserts the verifier names it. The breakages are the real failures this
project has had or nearly had (whole-branch review, 2026-10-05): a stale or
exported draft riding in through the fetched-culture folder, a licence-less
culture passing the id-only attribution check, an uncredited survey passing a
substring test, and a bundle built before the exclusion list changed.
"""
import hashlib
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "deploy"))

from verify_bundle import verify_bundle  # noqa: E402

SOURCE_URL = "https://example.org/source"
BASE = "/Sub/"
SHA = "a" * 40

MANIFEST = {
    "cultures": [{"id": "kamilaroi", "reason": "licence"}],
    "fetched_skycultures_published": ["maori", "western"],
    "authored_skycultures_published": ["osage"],
    "bundled_skycultures_allowed": ["western"],
    "withheld_surveys": ["dso"],
    "bundled_engine_data": {
        "top_level": ["stars", "mpcorb.dat"],
        "skycultures_files": ["index.json", "README.md"],
        "surveys": ["milkyway"],
    },
}

GOOD_DESCRIPTION = "# X\n\n## Authors\n\nSomeone\n\n## License\n\nCC BY-SA 4.0\n"


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _manifest_file(tmp_path: Path, manifest=None) -> Path:
    p = tmp_path / "exclusions.json"
    p.write_text(json.dumps(manifest or MANIFEST))
    return p


def _bundle(tmp_path: Path, manifest_path: Path) -> Path:
    out = tmp_path / "out"
    shipped = ["maori", "western", "osage"]
    for c in shipped:
        _write(out / "skycultures" / c / "index.json", "{}")
        _write(out / "skycultures" / c / "description.md", GOOD_DESCRIPTION)
    _write(out / "index.html", f'<script src="{BASE}assets/index-abc.js"></script>')
    _write(out / "assets" / "index-abc.js", f'const s="{SOURCE_URL}";')
    _write(out / "cities.json", "[]")
    _write(out / "taxonomy.json", json.dumps([
        {"id": "b", "children": [{"id": c, "skyculture_id": c} for c in shipped]
         + [{"id": "kamilaroi", "skyculture_id": None, "excluded": True}]},
    ]))
    _write(out / "attribution.json", json.dumps({"cultures": [
        {"id": c, "authors_md": "Someone", "license_md": "CC BY-SA 4.0"} for c in shipped
    ], "surveys": [], "engine_data": {"items": [
        {"path": "stars"}, {"path": "mpcorb.dat"}, {"path": "surveys/milkyway"},
    ]}}))
    _write(out / "skydata" / "stars" / "properties", "type = stars\n")
    _write(out / "skydata" / "mpcorb.dat", "")
    _write(out / "skydata" / "skycultures" / "western" / "index.json", "{}")
    _write(out / "skydata" / "skycultures" / "index.json", "{}")
    _write(out / "skydata" / "surveys" / "milkyway" / "properties", "obs_title = mw\n")
    _write(out / "build.json", json.dumps({
        "source_sha": SHA,
        "dirty": False,
        "exclusions_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
    }))
    return out


def _verify(out, manifest_path, **kw):
    kw.setdefault("base", BASE)
    kw.setdefault("source_url", SOURCE_URL)
    kw.setdefault("expect_sha", SHA)
    return verify_bundle(out, manifest_path, **kw)


@pytest.fixture
def setup(tmp_path):
    m = _manifest_file(tmp_path)
    return _bundle(tmp_path, m), m


def test_good_bundle_passes(setup):
    out, m = setup
    assert _verify(out, m) == []


def _assert_error(errors, needle):
    assert any(needle in e for e in errors), errors


# --- the culture set is exactly what the manifest allowlists ---------------

def test_stale_or_exported_draft_in_skycultures_fails(setup):
    """The 2026-10-05 Critical: a draft whose authored source was deleted or
    renamed, or an export, sat in web/public/skycultures and shipped."""
    out, m = setup
    _write(out / "skycultures" / "yana_phuyu" / "index.json", "{}")
    _write(out / "skycultures" / "yana_phuyu" / "description.md", GOOD_DESCRIPTION)
    _assert_error(_verify(out, m), "yana_phuyu")


def test_missing_allowlisted_culture_fails(setup):
    out, m = setup
    import shutil
    shutil.rmtree(out / "skycultures" / "maori")
    _assert_error(_verify(out, m), "maori")


def test_excluded_culture_fails(setup):
    out, m = setup
    _write(out / "skycultures" / "kamilaroi" / "index.json", "{}")
    _assert_error(_verify(out, m), "kamilaroi")


def test_export_sentinel_fails_even_under_an_allowlisted_name(setup):
    """Drafts exported under a fetched culture's key replaced its upstream
    data; the allowlisted name alone cannot catch that."""
    out, m = setup
    _write(out / "skycultures" / "maori" / ".exported-from-drafts", "")
    _assert_error(_verify(out, m), "exported")


def test_loose_file_in_skycultures_fails(setup):
    out, m = setup
    _write(out / "skycultures" / "belarusian.zip", "x")
    _assert_error(_verify(out, m), "belarusian.zip")


def test_manifest_allowlisting_an_excluded_culture_fails(tmp_path):
    bad = dict(MANIFEST, fetched_skycultures_published=["maori", "western", "kamilaroi"])
    m = _manifest_file(tmp_path, bad)
    out = _bundle(tmp_path, m)
    _assert_error(_verify(out, m), "kamilaroi")


# --- attribution is complete, not just id-matched --------------------------

def test_culture_without_licence_fails(setup):
    out, m = setup
    att = json.loads((out / "attribution.json").read_text())
    att["cultures"][0]["license_md"] = None
    (out / "attribution.json").write_text(json.dumps(att))
    _assert_error(_verify(out, m), "licence")


def test_todo_licence_fails(setup):
    """The belarusian culture's licence read 'Text and data: TODO'."""
    out, m = setup
    att = json.loads((out / "attribution.json").read_text())
    att["cultures"][0]["license_md"] = "Text and data: TODO"
    (out / "attribution.json").write_text(json.dumps(att))
    _assert_error(_verify(out, m), "TODO")


def test_attribution_set_mismatch_fails(setup):
    out, m = setup
    att = json.loads((out / "attribution.json").read_text())
    att["cultures"].pop()
    (out / "attribution.json").write_text(json.dumps(att))
    _assert_error(_verify(out, m), "attribution")


def test_dangling_taxonomy_reference_fails(setup):
    out, m = setup
    tax = json.loads((out / "taxonomy.json").read_text())
    tax[0]["children"].append({"id": "ghost", "skyculture_id": "ghost"})
    (out / "taxonomy.json").write_text(json.dumps(tax))
    _assert_error(_verify(out, m), "ghost")


# --- skydata: every path accounted for -------------------------------------

def test_unknown_skydata_entry_fails(setup):
    out, m = setup
    _write(out / "skydata" / "landscapes" / "x" / "properties", "")
    _assert_error(_verify(out, m), "landscapes")


def test_unallowed_bundled_culture_fails(setup):
    out, m = setup
    _write(out / "skydata" / "skycultures" / "belarusian" / "index.json", "{}")
    _assert_error(_verify(out, m), "belarusian")


def test_withheld_survey_fails(setup):
    out, m = setup
    _write(out / "skydata" / "surveys" / "dso" / "properties", "obs_copyright = x\n")
    _assert_error(_verify(out, m), "dso")


def test_uncredited_unlisted_survey_fails(setup):
    out, m = setup
    _write(out / "skydata" / "surveys" / "new" / "properties", "obs_title = n\n")
    _assert_error(_verify(out, m), "new")


@pytest.mark.parametrize("props", [
    "obs_copyright =\n",               # empty value
    "# obs_copyright = someone\n",     # commented out
    "obs_copyright_url = http://x\n",  # a URL is not a credit
])
def test_survey_credit_is_not_a_substring_test(setup, props):
    out, m = setup
    _write(out / "skydata" / "surveys" / "new" / "properties", props)
    _assert_error(_verify(out, m), "new")


def test_credited_survey_passes(setup):
    out, m = setup
    _write(out / "skydata" / "surveys" / "new" / "properties", "obs_copyright = Someone\n")
    assert _verify(out, m) == []


# --- the bundle is the one this source state built -------------------------

def test_missing_build_stamp_fails(setup):
    out, m = setup
    (out / "build.json").unlink()
    _assert_error(_verify(out, m), "build.json")


def test_bundle_built_under_a_different_manifest_fails(setup):
    """Build, then tighten exclusions.json, then publish: the old bundle
    used to ship."""
    out, m = setup
    data = json.loads(m.read_text())
    data["withheld_surveys"].append("milkyway2")
    m.write_text(json.dumps(data))
    _assert_error(_verify(out, m), "exclusions.json")


def test_bundle_from_another_commit_fails(setup):
    out, m = setup
    _assert_error(_verify(out, m, expect_sha="b" * 40), "commit")


def test_bundle_from_dirty_tree_fails_when_publishing(setup):
    out, m = setup
    stamp = json.loads((out / "build.json").read_text())
    stamp["dirty"] = True
    (out / "build.json").write_text(json.dumps(stamp))
    _assert_error(_verify(out, m), "dirty")


# --- base path and AGPL link ------------------------------------------------

def test_wrong_base_fails(setup):
    out, m = setup
    _assert_error(_verify(out, m, base="/"), "base")


def test_missing_source_link_fails(setup):
    out, m = setup
    (out / "assets" / "index-abc.js").write_text("nothing")
    _assert_error(_verify(out, m), "AGPL")


def test_missing_cities_fails(setup):
    out, m = setup
    (out / "cities.json").unlink()
    _assert_error(_verify(out, m), "cities.json")


def test_real_manifest_is_self_consistent():
    """The checked-in manifest: fetched allowlist disjoint from the denylist,
    no authored culture double-listed as fetched, required keys non-empty."""
    data = json.loads((REPO_ROOT / "deploy" / "exclusions.json").read_text())
    excluded = {c["id"] for c in data["cultures"]}
    fetched = set(data["fetched_skycultures_published"])
    authored = set(data["authored_skycultures_published"])
    assert fetched and data["withheld_surveys"] and data["bundled_skycultures_allowed"]
    assert not fetched & excluded
    assert not authored & excluded
    assert not fetched & authored
    authored_on_disk = {p.name for p in (REPO_ROOT / "data" / "skycultures_authored").iterdir()
                        if p.is_dir()}
    assert not fetched & authored_on_disk


def test_uncredited_engine_data_fails(setup):
    """The engine's demo data shipped with no credit shown anywhere."""
    out, m = setup
    att = json.loads((out / "attribution.json").read_text())
    att["engine_data"]["items"] = [{"path": "stars"}]
    (out / "attribution.json").write_text(json.dumps(att))
    _assert_error(_verify(out, m), "mpcorb.dat")
