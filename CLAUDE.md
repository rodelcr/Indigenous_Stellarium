# CLAUDE.md — Indigenous Stellarium

Project-level context. The global `~/.claude/CLAUDE.md` conventions apply on
top of this. Read `docs/DESIGN.md` (the spec) and `docs/GOVERNANCE.md` (the
steward model) before changing anything that touches cultural content.

---

## What this is

A web sky viewer where **indigenous constellations are the default and
Western/IAU is off unless chosen**, plus an authoring surface where community
members define constellations by clicking stars and attach provenance.
Authored cultures export to Stellarium's native sky-culture format, so
contributions can leave this app and load into desktop Stellarium ≥ v24.4.

Built on `stellarium-web-engine` (C → WebAssembly, AGPL-3.0, upstream dormant
since Dec 2021), a Vue 3 + Vite frontend, and a FastAPI + stdlib-`sqlite3`
backend.

---

## Hard rules

These are the point of the project, not policy garnish. Violating one is a
worse outcome than shipping nothing.

1. **Never fabricate cultural content.** No invented constellation names, star
   names, descriptions, translations, or example text — ever. Where a source
   is missing, omit. A thinner honest artifact beats a richer invented one.
   `data/skycultures_authored/yana_phuyu/` ships eight dark-cloud figures with
   **no geometry at all** because the literature describes them in prose, not
   coordinates; drawing outlines would have put fabricated shapes under a
   community's name.
2. **Never assert a licence on a community's behalf.** Exported drafts say
   licensing is to be determined by the contributing community. Do not
   default them to CC-BY-SA or anything else.
3. **Never fabricate a citation.** If a source can't be verified, say so.
   Sources known only second-hand are listed as such, separately from sources
   actually read.
4. **Provenance is required on both sides of the wire.** Contributor,
   community, source, permission — non-blank after trimming, enforced
   server-side (`backend/app.py`) *and* client-side (`web/src/draftStore.js`).
   A stored draft without provenance is the exact failure this platform exists
   to prevent.
5. **Redistribution rights are checked per culture.** `kamilaroi` and `lokono`
   are excluded from every public deploy — both licences name a *specific*
   permitted redistributor (Stellarium developers; Stellarium Labs) who is not
   us. The manifest is `deploy/exclusions.json`, enforced with a post-copy
   assertion, not just a filter.
   **There are TWO sources of cultural content.** `web/public/skycultures/` is
   the fetched set; `web/public/skydata/` is the *engine's own demo data* and
   ships sky cultures too. Both deploy paths copy skydata wholesale, so it gets
   an allowlist (`bundled_skycultures_allowed`) naming only what `engine.js`
   actually boots. A `belarusian` culture shipped live through this gap —
   unattributed, and licensed upstream as "Text and data: TODO".
6. **Catalogue numbers are storage, never interface.** HIP ids must stay
   internally — Stellarium's constellation `lines` *are* HIP arrays, and
   dropping them forfeits export and upstreaming. But no contributor should
   ever have to read one. See `web/src/starDisplayName.js`.

---

## Commands

```sh
# One-time: build the engine to WebAssembly (needs emcc + scons)
./scripts/build_engine.sh

# One-time: fetch sky cultures from upstream (network)
./backend/.venv/bin/python scripts/fetch_skycultures.py \
    --dest web/public/skycultures \
    maori hawaiian_starlines tongan anutan tukano tupi lokono \
    northern_andes aztec inuit navajo blackfoot kamilaroi boorong western

# Frontend dev server (proxies /api -> :8000)
cd web && npm install && npm run dev

# Backend
./backend/.venv/bin/uvicorn backend.app:app --reload --port 8000

# Tests — 68 frontend, 42 backend/scripts
cd web && npx vitest run
./backend/.venv/bin/python -m pytest tests/ backend/ -q

# Export a draft culture to Stellarium's native format
./backend/.venv/bin/python scripts/export_skyculture.py \
    --culture rapa_nui --dest web/public/skycultures

# Build the static GitHub Pages bundle, then publish it
./deploy/pages.sh
./deploy/publish_pages.sh
```

**Never run an installer (`npm install`, `pip install`) inside a subagent.**
A permission-gated command in a subagent hangs silently and forever — no
error, no timeout. Front-load installs in the main session. This killed
several agents before it was diagnosed.

---

## Layout

| Path | What lives there |
|---|---|
| `web/src/engine.js` | The **only** module that touches the raw engine. Everything else goes through `getStel()`. |
| `web/src/selection.js` | `parseHip()`, `onStarSelected()`, `onSelectionCleared()`. `culturalNames` in the payload is an **array**. |
| `web/src/authoring.js` | Pure polyline state machine — no engine dependency, which is what makes it testable. |
| `web/src/overlay.js` | Sky→screen projection for the in-progress constellation, hand-derived from the engine's C source. |
| `web/src/draftStore.js` | Backend POST with a **localStorage fallback** when no backend exists. |
| `web/src/starDisplayName.js` | Positive-identification display names, so catalogue designations never leak into the UI. |
| `web/src/styles/tokens.css` | House style. Consolas, `--radius: 0`, no glow/bloom/gradient/blur. |
| `backend/app.py`, `backend/db.py` | FastAPI + stdlib sqlite3. No ORM. |
| `scripts/*.patch` | Three engine patches, applied idempotently by `build_engine.sh`. |
| `data/taxonomy.json` | Culture tree. `skyculture_id: null` + `placeholder: true` = a first-class invitation to contribute, not a disabled row. |
| `data/skycultures_authored/` | Cultures authored **inside** this project (vs. fetched). |
| `deploy/exclusions.json` | **The** source of truth for withheld cultures. Read by both deploy paths and by `filter_taxonomy.py`. |
| `deploy/pages.sh` | Static Pages build. Verifies the built artifact, not the intent. `publish_pages.sh` pushes it. |

Git-ignored and regenerated, never hunted for: `vendor/`,
`web/public/{engine,skydata,skycultures,taxonomy.json,attribution.json}`,
`backend/{.venv,drafts.sqlite}`, `deploy/.pages/`.

---

## Data model (pinned)

`drafts` table — `backend/db.py`:

```
id, culture_key, name_english, name_native, pronounce,
lines (JSON: list of HIP polylines), notes,
provenance (JSON: {contributor, community, source, permission}),
status  DEFAULT 'draft',      -- Phase 2 adds submitted/approved/restricted
kind    DEFAULT 'polyline',   -- discriminator for non-line representations
created_at, updated_at
```

`status` and `kind` exist **now**, before the features that use them, so
Phase 2 and a widened authoring model are non-breaking additions rather than
migrations against live rows.

**Two fields are still missing and should be added before real contributor
rows exist:** the language a draft was written in (the sky-culture format has
`native_lang`), and location-privacy handling for horizon panoramas.

---

## Verified engine API (don't re-research)

- Boot: `StelWebEngine({wasmFile, canvas, translateFn, onReady})`.
- Cultures: `stel.core.skycultures.addDataSource({url, key})`, then set the
  `current_id` string property.
- Visibility: `stel.core.constellations.{lines,labels,images}_visible`;
  `stel.core.stars.hints_visible`.
- Identity: `obj.designations()` → `["Arcturus", "* alf Boo", "* 16 Boo", "HIP 69673"]`;
  `obj.culturalDesignations()`.
- Observer lat/lon are **radians** (`lat * DD2R`).
- `dateToMjd(d) = d.getTime() / 86400000 + 40587`.

---

## Gotchas found the hard way

**The HIP patch is load-bearing.** `star_get_designations()` originally
synthesised `"HIP <n>"` only as a *fallback* for stars with no other ids, so
named stars carried no HIP designation and object→HIP was unreachable from
JS. `scripts/hip-designation.patch` makes it always emit. **Without this the
authoring tool cannot work at all.** Note that `"HIP %d"` appears in the
pre-patch binary too — `strings` on the wasm proves nothing. Verify
empirically: select Arcturus, check `designations()`.

**Vite's dev server answers any unmatched path with 200 + index.html**, not a
404. A naive `res.ok` check reported every placeholder culture as having an
exported draft. `web/src/draftAvailability.js` exists to keep that bug from
coming back — it requires a parsed JSON body with a string `id`.

**Verify the artifact, never the intent.** This bit twice in one session.
`pages.sh` checks the built bundle; `publish_pages.sh` did not check the
remote, and reported a successful publish while the stale bundle stayed live
(its `git checkout --orphan gh-pages` failed on every run after the first,
with stderr swallowed). Both now verify what actually landed.

**The engine clone is pinned** (`ENGINE_COMMIT` in `build_engine.sh`). The
patches match on context lines, so an unpinned clone is a reproducibility
hazard. Note the engine *core* is dormant since Dec 2021 but the *repository*
is not — the pinned SHA is dated 2026-08-11. To move the pin: update the SHA,
clone fresh, confirm all three patches `git apply --check` clean.

**A 4xx rejection must not fall back to localStorage.** `draftStore.js` falls
back on an *unreachable* backend (network error or 404), never on a 422 —
falling back on a rejection would route around provenance enforcement.
`saveLocal` re-runs the same validation client-side.

**The bundled sky data is a deliberately minimal demo set**, and that single
fact explains three symptoms that look unrelated: stars capped at
`max_vmag = 7.0`, the Milky Way at `hips_order = 0` (132 KB, one tile level —
dust lanes are *unresolvable*, not merely faint), and `stel.getObj()`
returning null for every deep-sky designation tried. **The fix is a
data-source swap, not engine work:** `eph` is proprietary for *star
catalogues only*; image surveys are plain standard HiPS. `data.stellarium.org`
publicly serves `surveys/{gaia_dr2_v2,dss,milkyway,dso}` in exactly the
formats this engine reads, and the engine already has a `dss` module we never
load. Caveats: someone else's bandwidth (mirror for production), order-9
needs network on every pan, and DSS attribution to STScI/NASA + CDS is
required.

**A community naming a star fainter than magnitude 7 currently cannot point
at it** — it is not in the dataset. That is a contribution blocker, not a
fidelity nicety.

**Localisation is a gap, not polish.** `engine.js` passes
`translateFn: (domain, str) => str` — a no-op. We download 105 `.po` catalogs
per culture and discard them, including a populated `es.po`. And **no
indigenous-language catalog is populated at all**: `haw.po` and `mi.po` don't
exist upstream. The Māori sky culture can be read in Spanish, German and
Japanese, but not in Māori. That asymmetry is what this project exists to
correct, which means indigenous-language support has to be a **contribution
surface** — translations authored by speakers, with provenance — not an
import.

---

## House style

Consolas first in the stack. `--radius: 0`. No glow, bloom, gradient, or
blur. Selection is a 2px left rule plus brighter text, never a coloured fill.
Accent `#ffd25a`, matched to the engine overlay's own marker colour. If a
change makes the UI look like a default component library, it's wrong.
