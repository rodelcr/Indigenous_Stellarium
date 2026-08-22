# Phase 2: Planetarium tools + Yana Phuyu — Design

> Brainstormed 2026-08-22, following Phase 1 (viewer + authoring demo,
> complete — see `docs/DESIGN.md`). This spec covers everything the user
> asked for in one pass: search/find, HST/JWST imagery links, time
> controls, observer lat/lon, a new Yana Phuyu (Andean dark-cloud) sky
> culture, a local-environment horizon overlay, and a parity backlog for
> "plenty more." GitHub Pages hosting is explicitly out of scope here —
> deferred to a follow-up conversation once this spec exists, since it
> can't be decided until the scope below is fixed.

## Decomposition

This is five largely-independent subsystems, not one feature. Each ships
and is tested independently; none blocks another except where noted.

| Sub-phase | What | Depends on |
|---|---|---|
| 2a | Core controls: search/find, time controls, observer lat/lon | nothing — pure engine wiring |
| 2b | Imagery links for extragalactic objects | nothing — static curated data + UI |
| 2c | Yana Phuyu sky culture (Andean dark clouds) | real citable sourcing (in progress, see below) |
| 2d | Local-environment horizon overlay | nothing |
| 2e | Parity backlog | opportunistic, after 2a–2d |

## Verified engine facts (checked against `vendor/stellarium-web-engine/src`, not assumed)

- **Search:** `Module['getObj'] = function(name) { core_search(name) ... }`
  in `src/js/obj.js` — exposed on the `stel` object returned by
  `StelWebEngine(...)`'s `onReady` callback as `stel.getObj(name)`,
  returning a selectable object or `null`. This is a **local, in-memory
  search** over whatever's already loaded (bright-star catalog,
  loaded sky cultures' common names, solar-system objects) — it is
  **not** an arbitrary-object-name lookup against a full external
  catalog. The engine's own reference frontend (`apps/web-frontend`)
  actually calls out to an external Simbad-backed API for its search
  box (`data-credits-dialog.vue`: "Queries from Simbad") — we are
  deliberately not building that; `getObj()` is genuinely useful (find
  "Polaris", "Sirius", any HIP-named or culturally-named star, "Sun",
  "Moon", the loaded planets) but its scope should be stated honestly
  in the UI, not oversold as "search anything."
- **Time:** `core.time_speed` (0 = paused, 1 = real-time, negative =
  reverse, verified via `src/core.c:1047` and the reference frontend's
  `date-time-picker.vue` pause toggle) and `core.observer.utc`
  (Modified Julian Date, settable directly — `App.vue:137` in the
  reference frontend: `this.$stel.core.observer.utc = d.getMJD()`).
- **Observer location:** `observer.longitude` / `observer.latitude`,
  both `TYPE_ANGLE` (`src/observer.c:339-340`) — plain settable
  properties on `stel.core.observer`.
- **Dark-cloud (line-less) constellations:** already have a real,
  in-repo precedent — Kamilaroi's `Gawaargay`/`Birray Birray`/etc.
  entries in `web/public/skycultures/kamilaroi/index.json` have **no
  `lines` key at all**, only `image` (a `.webp` illustration anchored to
  3 HIP stars via `anchors: [{pos:[x,y], hip:N}, ...]`) plus
  `common_name`. This is exactly the shape `backend/db.py`'s `kind`
  column already anticipates (its own comment names this exact
  scenario). Yana Phuyu reuses this shape — no schema change needed.
- **Landscape:** the engine has a real `landscapes` module
  (`core.landscapes.addDataSource(...)`, `core.landscapes.visible`),
  but it consumes pre-tiled HiPS panorama data sources, the same
  production pipeline as sky cultures/star catalogs — not a "drop in a
  JPEG" flow. Building 2d against this module is out of scope for a
  demo; see 2d below for the lighter approach instead.

## 2a. Core planetarium controls

**Components** (mirroring Phase 1's pattern — one thin Vue component per
concern, engine calls funneled through small pure/testable modules):

- `web/src/components/SearchPanel.vue` — text input, calls
  `stel.getObj(query)` on submit (not on every keystroke — this is a
  local lookup, not autocomplete, per the scope note above). On hit,
  sets `stel.core.selection = obj` and (reusing the existing overlay
  pan/zoom pattern from `sw_helpers.js`'s projection code, already read
  for Task 6) centers the view. On miss, shows "No match" — never
  invents a result.
- `web/src/components/TimeControl.vue` — pause/normal/rewind/fast-
  forward buttons driving `core.time_speed` (discrete steps: e.g. 0,
  ±1, ±60, ±3600 — mirrors Stellarium's own step convention), plus a
  "now" reset button that sets `core.observer.utc` back to the current
  real time. Time display reads `core.observer.utc` back out (MJD →
  human string — reuse a date conversion helper, do not hand-roll MJD
  math twice).
- `web/src/components/LocationPanel.vue` — lat/lon numeric inputs
  (decimal degrees) writing `core.observer.longitude/.latitude`
  (converted to the engine's angle units — verify exact unit expected,
  likely radians, in the implementation plan's spike step rather than
  assumed here). No geocoding/city-name lookup in v1 — raw lat/lon
  only; a "use my location" browser-geolocation button is a cheap v1.1
  add, not blocking.

**Testing:** pure conversion/formatting helpers (MJD↔display, degrees↔
engine units, time-step sequencing) get the same vitest unit-test
treatment as `starDisplayName.js`/`selection.js` — component files stay
thin wiring, logic stays in testable modules.

**No backend involvement.** No new API routes, no DB changes.

## 2b. HST/JWST imagery links (extragalactic objects)

**Decision: link out, never proxy or host.** No backend imagery
storage, no licensing gray zone — NASA/ESA/STScI public-outreach
imagery is public domain or CC BY, and their own gallery pages are the
authoritative, always-current source (better than us mirroring a
snapshot).

- A small hand-curated `web/src/extragalacticImagery.json` (or `.js`
  data module): a short list of well-known extragalactic objects (e.g.
  M31/Andromeda, M87, Centaurus A, M104/Sombrero, M51/Whirlpool — final
  list drawn from real MAST/ESA Hubble "greatest hits" galleries, not
  invented ad hoc) mapping `{names/designations, gallery_url}` to real,
  checked URLs (esahubble.org, webbtelescope.org, or
  hubblesite.org/stsci gallery pages for that specific object).
- Extend `selection.js` (currently star-only — `onStarSelected` never
  fires for a DSO) with a parallel `onDsoSelected` path, or a more
  general selection type discriminator, so `StarInfo.vue` (or a new
  `ObjectInfo.vue` alongside it) can detect "this selection matches a
  curated extragalactic object" and show a real, external "View
  Hubble/Webb imagery ↗" link. No match → panel says nothing extra,
  same "don't fabricate/don't fill gaps" discipline as everywhere else
  in this project.
- This item is genuinely small — a JSON file + one selection-path
  extension + one link in an existing panel.

## 2c. Yana Phuyu (Andean dark-cloud constellations)

**Sourcing approach (your call, option 2):** real citable literature,
not memory, with a fact-check gate before anything is presented as
real content.

**Process:**
1. Research pass (I do this, cite everything, no invented star
   assignments): primary target is Gary Urton's *At the Crossroads of
   the Earth and the Sky: An Andean Cosmology* (the standard
   ethnoastronomy reference for the Yana Phuyu dark-cloud figures —
   Llama/Yacana, Fox/Atoq, Toad/Hanp'atu, Serpent/Machacuay, Tinamou/
   Yutu, and the two Ilamas' eyes at α/β Centauri), cross-checked
   against any secondary academic sources I can actually verify (not
   just cite because they sound right). If I can't verify a specific
   star/region assignment to my own satisfaction, it gets flagged as
   uncertain rather than asserted — same standard as your fact-critic
   workflow.
2. Draft `description.md` (Introduction/Description/References/
   Authors/License sections, matching the existing format) with real
   inline citations, plus a **draft** `index.json` using the Kamilaroi
   no-lines-image-anchors shape (or, where I can't responsibly assign a
   precise illustration/anchor without fabricating pixel coordinates, a
   `common_names`-only entry naming the dark-cloud figure and its
   approximate sky region in prose, deferring precise `anchors` to
   local/community input rather than guessing coordinates).
3. **You review it before it's treated as real** — same gate as any
   citation-bearing draft in your other projects. Until reviewed, it
   lives in the repo as clearly-marked draft content, not shipped to
   any deployed Space.
4. Taxonomy: add `yana_phuyu` under a new or existing South-American
   bucket in `data/taxonomy.json` immediately (this step alone, today)
   as `skyculture_id: null, placeholder: true` — identical to how
   Mapuche/Diaguita/Quechua already sit. This makes it visible and
   author-able through the existing draft/provenance pipeline right
   now, independent of the research pass above.
5. When local/community sources arrive later (your stated plan), they
   supersede or extend the literature draft — the existing
   provenance-required authoring flow already handles "this is where
   this knowledge came from" per-entry, so this isn't a new mechanism,
   just new input to the existing one.

**This sub-phase has two deliverables, sequenced:** (a) the taxonomy
placeholder, shippable immediately with zero research risk; (b) the
literature-sourced draft, which needs your review before it's "real."

## 2d. Local-environment horizon overlay

**Decision: lightweight custom overlay, not the engine's native
landscape/HiPS pipeline** (per the verified-facts note above — the real
pipeline is a production tiling workflow, out of scope for a demo
upload feature).

- User uploads a single horizon/panorama photo (client-side only,
  `<input type="file">`, no backend storage in v1 — matches the
  demo-sandbox/ephemeral-storage posture already established for
  drafts).
- Rendered as a fixed image strip along the bottom of the viewport,
  behind/under the sky canvas, NOT wired into the engine's coordinate
  system or azimuth-aligned in v1 (true horizon alignment would need
  real azimuth calibration UI — a v1.1 concern, not blocking a first
  cut). State this limitation directly in the UI ("decorative horizon,
  not azimuth-aligned") rather than implying more precision than it
  has.
- New `web/src/components/HorizonOverlay.vue`, `web/src/horizonImage.js`
  (pure: object-URL lifecycle management, testable).

## 2e. Parity backlog (audit, not build list)

Quick audit of engine capabilities already available but not yet
exposed in the UI, to prioritize opportunistically after 2a–2d:
constellation-art image toggle (`core.constellations.images_visible` —
verified present, same object as the already-used `.lines_visible`/
`.labels_visible`), atmosphere toggle, DSO label visibility, planet
visibility/labels, FOV/zoom presets. This list gets refined once 2a–2d
are in and we see what's actually missing in practice — YAGNI against
guessing now.

## Non-goals (this spec)

- Backend imagery hosting/proxying.
- Full HiPS landscape/panorama tiling pipeline.
- Governance/steward review workflow (unchanged, still its own future
  phase per `docs/DESIGN.md`).
- GitHub Pages hosting — deferred, see note at top.
- Autocomplete/fuzzy search, city-name geocoding, azimuth-calibrated
  horizon alignment — all named above as explicit v1.1+ items, not v1.

## Implementation sequencing

1. **2a + 2b together** — no dependencies, both pure frontend, ship
   first via `writing-plans`.
2. **2c taxonomy placeholder** — trivial, can land same day as 2a/2b.
3. **2c literature draft** — research + your review, in parallel with
   1–2, not blocking them.
4. **2d** — after 2a/2b, similar size.
5. **2e** — opportunistic once the above are live.
