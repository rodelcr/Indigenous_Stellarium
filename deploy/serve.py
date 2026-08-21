#!/usr/bin/env python3
"""serve.py — production entrypoint for the Hugging Face Space.

Imports backend/app.py UNMODIFIED (it stays exactly as tested by
backend/test_app.py) and, only when a `static/` directory is actually
present next to this file, mounts it at "/" to serve the built frontend
(web/dist's contents: index.html, the JS/CSS bundle, and the copied
web/public assets — engine wasm/js, skydata, skycultures, taxonomy.json,
attribution.json).

The conditional mount matters for two reasons:
  - Locally (running the source tree, not the built image) there is no
    static/ directory, so importing this module never breaks — it just
    behaves like backend/app.py's API alone.
  - In the deployed image, the Dockerfile places static/ as a SIBLING of
    this file (deploy/serve.py -> ../static), matching this file's own
    location one level under the project root, exactly like backend/ is
    one level under the project root. See deploy/Dockerfile's COPY
    layout — the sibling relationship between deploy/, backend/, and
    static/ is what this path arithmetic depends on.

Route ordering: backend/app.py's /api/* routes are registered at import
time, before the static mount is added below, so they are matched first
regardless of the catch-all "/" mount added here. There is no separate
SPA client-side router in this project (no vue-router — see
web/src/main.js), so plain static file serving is sufficient; no
history-fallback logic is needed.
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

import app as backend_app  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

app = backend_app.app

STATIC_DIR = PROJECT_ROOT / "static"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import os

    import uvicorn

    port = int(os.environ.get("PORT", "7860"))
    uvicorn.run(app, host="0.0.0.0", port=port)
