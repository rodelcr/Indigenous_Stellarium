# db.py — SQLite persistence for constellation drafts. Stdlib sqlite3 only,
# no ORM (project-wide constraint). Importable (app.py uses these functions
# directly) and runnable via `python db.py` for a quick schema-init /
# row-count check against the default DB file.
#
# Schema is exactly the Draft data model pinned in docs/DESIGN.md's "Data
# model" section, plus one extra controller-decided column: `kind`, a
# discriminator defaulted to 'polyline' so a future non-line constellation
# representation (e.g. the Kamilaroi dark constellation Gawaargay, which has
# no line data at all) is a non-breaking addition later rather than a
# migration against live rows now.

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parent / "drafts.sqlite"

SCHEMA = """
CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    culture_key TEXT NOT NULL,
    name_english TEXT NOT NULL DEFAULT '',
    name_native TEXT NOT NULL DEFAULT '',
    pronounce TEXT NOT NULL DEFAULT '',
    lines TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    provenance TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    kind TEXT NOT NULL DEFAULT 'polyline',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def get_connection(db_path=DEFAULT_DB_PATH):
    """Open a sqlite3 connection with Row access by column name.

    check_same_thread=False because FastAPI's TestClient/uvicorn may hand
    requests to the connection from a different thread than the one that
    opened it; access is otherwise effectively single-threaded per request
    in this demo (no connection pool).
    """
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn):
    """Create the drafts table if it doesn't already exist."""
    conn.execute(SCHEMA)
    conn.commit()


def _row_to_dict(row):
    return {
        "id": row["id"],
        "culture_key": row["culture_key"],
        "name_english": row["name_english"],
        "name_native": row["name_native"],
        "pronounce": row["pronounce"],
        "lines": json.loads(row["lines"]),
        "notes": row["notes"],
        "provenance": json.loads(row["provenance"]),
        "status": row["status"],
        "kind": row["kind"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def insert_draft(conn, draft):
    """Insert a new draft. `draft` is a plain dict matching the API's
    DraftIn shape (culture_key, name_english, name_native, pronounce,
    lines, notes, provenance). status/kind are always set server-side to
    their defaults; a client can't request a different one yet. Returns
    the new row's id.
    """
    now = datetime.now(timezone.utc).isoformat()
    cur = conn.execute(
        """
        INSERT INTO drafts
            (culture_key, name_english, name_native, pronounce, lines,
             notes, provenance, status, kind, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'polyline', ?, ?)
        """,
        (
            draft["culture_key"],
            draft.get("name_english", ""),
            draft.get("name_native", ""),
            draft.get("pronounce", ""),
            json.dumps(draft.get("lines", [])),
            draft.get("notes", ""),
            json.dumps(draft["provenance"]),
            now,
            now,
        ),
    )
    conn.commit()
    return cur.lastrowid


def list_drafts(conn):
    """All drafts, most recently created first."""
    rows = conn.execute("SELECT * FROM drafts ORDER BY id DESC").fetchall()
    return [_row_to_dict(row) for row in rows]


def get_draft(conn, draft_id):
    """A single draft dict, or None if draft_id doesn't exist."""
    row = conn.execute(
        "SELECT * FROM drafts WHERE id = ?", (draft_id,)
    ).fetchone()
    return _row_to_dict(row) if row is not None else None


def update_draft(conn, draft_id, draft):
    """Overwrite an existing draft's content fields (not status/kind — no
    review-workflow transitions in this task). Returns True if a row was
    updated, False if draft_id doesn't exist.
    """
    now = datetime.now(timezone.utc).isoformat()
    cur = conn.execute(
        """
        UPDATE drafts
        SET culture_key = ?, name_english = ?, name_native = ?,
            pronounce = ?, lines = ?, notes = ?, provenance = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            draft["culture_key"],
            draft.get("name_english", ""),
            draft.get("name_native", ""),
            draft.get("pronounce", ""),
            json.dumps(draft.get("lines", [])),
            draft.get("notes", ""),
            json.dumps(draft["provenance"]),
            now,
            draft_id,
        ),
    )
    conn.commit()
    return cur.rowcount > 0


if __name__ == "__main__":
    # Quick manual check: init the schema against the default DB file and
    # report how many drafts currently exist there.
    conn = get_connection()
    init_db(conn)
    count = conn.execute("SELECT COUNT(*) FROM drafts").fetchone()[0]
    print(f"drafts.sqlite ready at {DEFAULT_DB_PATH} ({count} draft(s) on file)")
    conn.close()
