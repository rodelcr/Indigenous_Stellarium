# app.py — FastAPI surface for draft persistence (Task 7).
#
# POST /api/drafts, GET /api/drafts, GET /api/drafts/{id}, PUT
# /api/drafts/{id}. Pydantic models are the server-side enforcement of the
# provenance requirement described in the task brief: `contributor`,
# `community`, `source`, and `permission` are all required (missing any one
# -> 422), `pronounce` is not. There is deliberately no "skip provenance"
# path, default value, or placeholder for any provenance field — a draft
# that records constellation lines without recording who holds that
# knowledge and under what terms it was shared is exactly what this
# platform must not accept.
#
# `status` and `kind` are never accepted from the client: every draft is
# created with status='draft' and kind='polyline' server-side (see db.py).
# Phase 2 review transitions and any future non-polyline `kind` are
# deliberately not implemented here.
#
# Runnable via `python app.py` (uvicorn on :8000) per the project's
# importable-and-runnable convention; also the module FastAPI/uvicorn/tests
# import directly.

from typing import List

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

import db

# Overridable by tests (monkeypatch this module attribute, then call
# reset_connection() to drop the cached connection so the next request
# reopens against the new path with a fresh schema).
DB_PATH = str(db.DEFAULT_DB_PATH)

_conn = None


def get_conn():
    global _conn
    if _conn is None:
        _conn = db.get_connection(DB_PATH)
        db.init_db(_conn)
    return _conn


def reset_connection():
    """Drop the cached connection so the next get_conn() call reopens
    against the current DB_PATH. Used by tests to isolate each test onto
    its own throwaway SQLite file.
    """
    global _conn
    if _conn is not None:
        _conn.close()
    _conn = None


class Provenance(BaseModel):
    # Pydantic v2 does not strip whitespace by default, so without this a
    # single space (" ") would pass min_length=1 and be stored as though it
    # were complete provenance — exactly the placeholder path this system
    # must never accept. Stripping first makes whitespace-only input fail
    # the length check the same way empty-string input already does.
    model_config = ConfigDict(str_strip_whitespace=True)

    contributor: str = Field(min_length=1)
    community: str = Field(min_length=1)
    source: str = Field(min_length=1)
    permission: str = Field(min_length=1)


class DraftIn(BaseModel):
    # Applied to the whole model (not just culture_key) so free-text fields
    # like name_native get the same "no meaningless leading/trailing
    # whitespace" treatment. These fields stay optional either way — this
    # only strips, it does not add a min_length constraint to them.
    model_config = ConfigDict(str_strip_whitespace=True)

    culture_key: str = Field(min_length=1)
    name_english: str = ""
    name_native: str = ""
    pronounce: str = ""
    lines: List[List[int]] = Field(default_factory=list)
    notes: str = ""
    provenance: Provenance


class DraftOut(DraftIn):
    id: int
    status: str
    kind: str
    created_at: str
    updated_at: str


app = FastAPI(title="Indigenous Stellarium draft API")


@app.post("/api/drafts", status_code=201)
def create_draft(draft: DraftIn):
    conn = get_conn()
    draft_id = db.insert_draft(conn, draft.model_dump())
    return {"id": draft_id}


@app.get("/api/drafts", response_model=List[DraftOut])
def list_drafts():
    conn = get_conn()
    return db.list_drafts(conn)


@app.get("/api/drafts/{draft_id}", response_model=DraftOut)
def get_draft(draft_id: int):
    conn = get_conn()
    row = db.get_draft(conn, draft_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return row


@app.put("/api/drafts/{draft_id}", response_model=DraftOut)
def update_draft(draft_id: int, draft: DraftIn):
    conn = get_conn()
    updated = db.update_draft(conn, draft_id, draft.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail="Draft not found")
    return db.get_draft(conn, draft_id)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
