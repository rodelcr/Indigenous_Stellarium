"""Behavioural tests for deploy/exclusions.sh, the shell side of the manifest.

These run the real script under bash against a fixture manifest. Until the
2026-10-05 review none of its guards had a test that would fail if the guard
were deleted; the reader guards matter most, because a SystemExit inside
`< <(...)` does not trip `set -e` and silently leaves an array empty.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]

GOOD = {
    "cultures": [{"id": "kamilaroi"}],
    "fetched_skycultures_published": ["maori"],
    "authored_skycultures_published": ["osage"],
    "bundled_skycultures_allowed": ["western"],
    "withheld_surveys": ["dso"],
}


def _run(tmp_path, manifest, body="true"):
    d = tmp_path / "deploy"
    d.mkdir(exist_ok=True)
    shutil.copy(REPO_ROOT / "deploy" / "exclusions.sh", d / "exclusions.sh")
    (d / "exclusions.json").write_text(json.dumps(manifest))
    script = f'set -euo pipefail; source "{d}/exclusions.sh"; {body}'
    return subprocess.run(["bash", "-c", script], capture_output=True, text=True)


def test_good_manifest_loads(tmp_path):
    r = _run(tmp_path, GOOD, 'echo "${FETCHED_PUBLISHED[*]}|${WITHHELD_SURVEYS[*]}"')
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "maori|dso"


@pytest.mark.parametrize("key", [
    "fetched_skycultures_published",
    "withheld_surveys",
    "bundled_skycultures_allowed",
    "cultures",
])
def test_missing_or_empty_list_refuses(tmp_path, key):
    bad = dict(GOOD)
    bad[key] = []
    r = _run(tmp_path, bad)
    assert r.returncode != 0
    assert "refusing" in r.stderr


def test_culture_both_published_and_excluded_refuses(tmp_path):
    bad = dict(GOOD, fetched_skycultures_published=["maori", "kamilaroi"])
    r = _run(tmp_path, bad)
    assert r.returncode != 0


def test_assert_no_excluded_cultures_catches_a_copy(tmp_path):
    out = tmp_path / "out"
    (out / "kamilaroi").mkdir(parents=True)
    r = _run(tmp_path, GOOD, f'assert_no_excluded_cultures "{out}"')
    assert r.returncode != 0
    assert "kamilaroi" in r.stderr


def test_assert_no_excluded_cultures_refuses_a_missing_dir(tmp_path):
    r = _run(tmp_path, GOOD, f'assert_no_excluded_cultures "{tmp_path}/nope"')
    assert r.returncode != 0


def test_assert_no_unpublished_authored_catches_a_draft(tmp_path):
    src, out = tmp_path / "authored", tmp_path / "out"
    for p in (src / "osage", src / "yana_phuyu", out / "osage", out / "yana_phuyu"):
        p.mkdir(parents=True)
    r = _run(tmp_path, GOOD, f'assert_no_unpublished_authored "{src}" "{out}"')
    assert r.returncode != 0
    assert "yana_phuyu" in r.stderr


def test_prune_withheld_surveys_removes_them(tmp_path):
    sd = tmp_path / "skydata"
    (sd / "surveys" / "dso").mkdir(parents=True)
    (sd / "surveys" / "milkyway").mkdir(parents=True)
    r = _run(tmp_path, GOOD, f'prune_withheld_surveys "{sd}"')
    assert r.returncode == 0, r.stderr
    assert not (sd / "surveys" / "dso").exists()
    assert (sd / "surveys" / "milkyway").exists()


def test_prune_bundled_skycultures_keeps_only_the_allowlist(tmp_path):
    sd = tmp_path / "skydata"
    (sd / "skycultures" / "western").mkdir(parents=True)
    (sd / "skycultures" / "belarusian").mkdir(parents=True)
    r = _run(tmp_path, GOOD, f'prune_bundled_skycultures "{sd}"')
    assert r.returncode == 0, r.stderr
    assert not (sd / "skycultures" / "belarusian").exists()
    assert (sd / "skycultures" / "western").exists()
