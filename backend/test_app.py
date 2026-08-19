# test_app.py — TDD tests for the draft-persistence API (Task 7).
#
# Uses httpx's ASGITransport to drive the FastAPI app in-process (no real
# uvicorn socket needed). Each test gets its own throwaway SQLite file via
# the `client` fixture so tests never see each other's rows.

import json

import pytest
from httpx import ASGITransport, AsyncClient

import app as app_module

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test_drafts.sqlite")


@pytest.fixture
async def client(db_path, monkeypatch):
    # Point the app at a fresh, isolated DB file and drop any cached
    # connection from a previous test so schema-on-startup runs again.
    monkeypatch.setattr(app_module, "DB_PATH", db_path)
    app_module.reset_connection()
    transport = ASGITransport(app=app_module.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app_module.reset_connection()


def valid_draft():
    return {
        "culture_key": "rapa_nui",
        "name_english": "Test",
        "lines": [[1, 2], [2, 3]],
        "provenance": {
            "contributor": "t",
            "community": "t",
            "source": "t",
            "permission": "demo",
        },
    }


async def test_post_draft_returns_201_and_id(client):
    res = await client.post("/api/drafts", json=valid_draft())
    assert res.status_code == 201
    body = res.json()
    assert "id" in body
    assert isinstance(body["id"], int)


async def test_get_draft_round_trips_and_defaults_status_draft(client):
    post_res = await client.post("/api/drafts", json=valid_draft())
    draft_id = post_res.json()["id"]

    get_res = await client.get(f"/api/drafts/{draft_id}")
    assert get_res.status_code == 200
    body = get_res.json()
    assert body["status"] == "draft"
    assert body["culture_key"] == "rapa_nui"
    assert body["name_english"] == "Test"
    assert body["lines"] == [[1, 2], [2, 3]]
    assert body["provenance"]["permission"] == "demo"
    # Deliberate controller decision (see task-7 brief / DESIGN.md note on
    # Gawaargay): every draft defaults to the 'polyline' kind discriminator.
    assert body["kind"] == "polyline"


async def test_post_missing_provenance_permission_is_422(client):
    draft = valid_draft()
    del draft["provenance"]["permission"]
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 422


async def test_post_missing_provenance_contributor_is_422(client):
    draft = valid_draft()
    del draft["provenance"]["contributor"]
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 422


async def test_post_missing_provenance_community_is_422(client):
    draft = valid_draft()
    del draft["provenance"]["community"]
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 422


async def test_post_missing_provenance_source_is_422(client):
    draft = valid_draft()
    del draft["provenance"]["source"]
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 422


async def test_post_missing_provenance_entirely_is_422(client):
    draft = valid_draft()
    del draft["provenance"]
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 422


async def test_post_whitespace_only_provenance_contributor_is_422(client):
    draft = valid_draft()
    draft["provenance"]["contributor"] = " "
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 422


async def test_post_whitespace_only_provenance_community_is_422(client):
    draft = valid_draft()
    draft["provenance"]["community"] = " "
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 422


async def test_post_whitespace_only_provenance_source_is_422(client):
    draft = valid_draft()
    draft["provenance"]["source"] = " "
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 422


async def test_post_whitespace_only_provenance_permission_is_422(client):
    draft = valid_draft()
    draft["provenance"]["permission"] = " "
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 422


async def test_post_whitespace_only_culture_key_is_422(client):
    draft = valid_draft()
    draft["culture_key"] = " "
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 422


async def test_post_strips_whitespace_from_optional_name_native(client):
    # Optional fields still get whitespace stripped (not just the required
    # ones) — a trailing space a contributor typed shouldn't be preserved
    # verbatim, and stripping must not turn this optional field required.
    draft = valid_draft()
    draft["name_native"] = "  Te Kāhui o Matariki  "
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 201
    draft_id = res.json()["id"]
    get_res = await client.get(f"/api/drafts/{draft_id}")
    assert get_res.json()["name_native"] == "Te Kāhui o Matariki"


async def test_pronounce_is_not_required(client):
    draft = valid_draft()
    assert "pronounce" not in draft
    res = await client.post("/api/drafts", json=draft)
    assert res.status_code == 201


async def test_get_drafts_lists_all(client):
    await client.post("/api/drafts", json=valid_draft())
    second = valid_draft()
    second["culture_key"] = "maori"
    await client.post("/api/drafts", json=second)

    res = await client.get("/api/drafts")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 2
    culture_keys = {d["culture_key"] for d in body}
    assert culture_keys == {"rapa_nui", "maori"}


async def test_get_unknown_draft_is_404(client):
    res = await client.get("/api/drafts/999999")
    assert res.status_code == 404


async def test_put_updates_draft_and_round_trips_lines(client):
    post_res = await client.post("/api/drafts", json=valid_draft())
    draft_id = post_res.json()["id"]

    updated = valid_draft()
    updated["lines"] = [[1, 2, 3], [3, 4]]
    updated["name_native"] = "Updated native name"
    put_res = await client.put(f"/api/drafts/{draft_id}", json=updated)
    assert put_res.status_code == 200
    assert put_res.json()["lines"] == [[1, 2, 3], [3, 4]]

    get_res = await client.get(f"/api/drafts/{draft_id}")
    body = get_res.json()
    assert body["lines"] == [[1, 2, 3], [3, 4]]
    assert body["name_native"] == "Updated native name"


async def test_put_unknown_draft_is_404(client):
    res = await client.put("/api/drafts/999999", json=valid_draft())
    assert res.status_code == 404


async def test_put_missing_provenance_is_422(client):
    post_res = await client.post("/api/drafts", json=valid_draft())
    draft_id = post_res.json()["id"]
    updated = valid_draft()
    del updated["provenance"]["permission"]
    res = await client.put(f"/api/drafts/{draft_id}", json=updated)
    assert res.status_code == 422


async def test_lines_round_trip_without_reshaping(client):
    # Task 8 reads `lines` back out to build sky-culture exports; it must
    # be exactly the list-of-HIP-polylines shape getDraft() produced, not
    # reshaped/flattened/stringified anywhere along the way.
    draft = valid_draft()
    draft["lines"] = [[98036, 97649, 97278], [97649, 95501]]
    post_res = await client.post("/api/drafts", json=draft)
    draft_id = post_res.json()["id"]
    get_res = await client.get(f"/api/drafts/{draft_id}")
    assert get_res.json()["lines"] == [[98036, 97649, 97278], [97649, 95501]]
