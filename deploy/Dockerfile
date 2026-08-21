# Indigenous Stellarium — Hugging Face Docker Space.
#
# Multi-stage build:
#   1. frontend-build   — npm ci + vite build. The three excluded sky
#                          cultures (kamilaroi, lokono, rapa_nui) are NOT
#                          filtered here — this Dockerfile builds whatever
#                          is present under web/public/skycultures/ in its
#                          build context. The exclusion is enforced by
#                          deploy/assemble.sh, which assembles the build
#                          context (the Space payload) without those three
#                          directories in the first place. See that
#                          script's own comments for the enforcement and
#                          verification steps.
#   2. attribution-build — generates static/attribution.json from each
#                          shipped culture's own description.md (Authors +
#                          License sections, extracted verbatim — see
#                          deploy/generate_attribution.py) so the UI shows
#                          real, sourced attribution rather than anything
#                          hand-written for this deploy.
#   3. runtime           — backend/app.py, UNCHANGED from what
#                          backend/test_app.py exercises, serving the built
#                          frontend as static files via deploy/serve.py.
#
# Build context is the repository root (or the assembled payload root,
# which mirrors the repository's layout — see deploy/assemble.sh).
# HF Spaces route traffic to port 7860.

FROM node:22-slim AS frontend-build
WORKDIR /app
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web/ ./web/
RUN cd web && npx vite build

FROM python:3.11-slim AS attribution-build
WORKDIR /app
COPY web/public/skycultures ./web/public/skycultures
COPY deploy/generate_attribution.py ./deploy/generate_attribution.py
RUN python deploy/generate_attribution.py web/public/skycultures attribution.json

FROM python:3.11-slim
WORKDIR /app

RUN useradd --create-home --uid 1000 appuser

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app.py backend/db.py ./backend/
COPY deploy/serve.py ./deploy/serve.py
COPY --from=frontend-build /app/web/dist ./static
COPY --from=attribution-build /app/attribution.json ./static/attribution.json

RUN chown -R appuser:appuser /app
USER appuser

ENV PORT=7860
EXPOSE 7860

CMD ["python", "deploy/serve.py"]
