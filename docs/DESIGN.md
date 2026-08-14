# Indigenous Stellarium — Design Spec

> Extracted verbatim from the "Context (spec)" section of the Phase 1
> implementation plan (`we-need-to-build-cheerful-cosmos.md`) on 2026-08-13.
> This is the project's spec; later tasks depend on its exact contents
> (especially the verified engine API notes and the sky-culture format
> details). Do not paraphrase — if the spec changes, update it here from
> the source plan, not by editing around it.

---

## Context (spec)

### Why

Rodrigo wants a platform that makes **indigenous constellations** first-class in a planetarium sky view and lets community members contribute their own star knowledge: click stars to define a constellation's members and lines, and attach stories (text/audio/video/images) to stars and constellations. Knowledge is organized in a hierarchical culture taxonomy — **Polynesian** → Rapa Nui, Aotearoa (Māori), Hawaiʻi, Tonga…; **South American** → Diaguita, Mapuche, Quechua, Tukano, Tupi… — extensible to more regions.

### Decisions made with Rodrigo (2026-08-13)

1. **Web-first, phased.** Build on the Stellarium web ecosystem (no install for contributors); validated cultures also export to Stellarium's **native sky-culture format** so desktop users can load them and contributions can go upstream to the official `stellarium-skycultures` repo.
2. **Governance: community stewards.** Each culture bucket gets designated steward accounts (community members / cultural practitioners) who approve submissions before publication. Must support restricted/withheld status — some knowledge is community-owned, seasonal, or not for public telling (CARE / indigenous data sovereignty). *Phase 2 feature; Phase 1 data model must not preclude it.*
3. **Story media: all shapes.** Text with required provenance (teller, community/source, language, permission status), audio, video, images/illustrations. *Phase 3 feature.*
4. **First milestone (THIS PLAN): viewer + authoring demo** — showable to communities/collaborators to recruit stewards. No accounts, no review queue, no story archive yet.

### Verified technical facts (researched 2026-08-13 — trust these over model memory)

- **stellarium-web-engine** (github.com/Stellarium/stellarium-web-engine): AGPL-3.0; engine core dormant since ~Dec 2021 but functional and not archived. **No prebuilt npm/wasm artifact exists** — must compile: `make js` with emscripten + scons installed (the repo also has a Docker path). Output: `stellarium-web-engine.js` + `.wasm`.
- **Engine JS API** (verified in source):
  - Init: `StelWebEngine({wasmFile, canvas, translateFn, onReady: function(stel){...}})` — see `apps/simple-html/stellarium-web-engine.html` in the engine repo (a complete minimal working example).
  - Load a sky culture: `stel.core.skycultures.addDataSource({url: '<base>/skycultures/<id>', key: '<id>'})`; switch with the `current_id` string property on `stel.core.skycultures`.
  - Toggle constellation display: `stel.core.constellations.lines_visible`, `.labels_visible`, `.images_visible` (booleans).
  - Clicks: `stel.on('click', cb)`; the clicked object lands in `stel.core.selection` (also settable from JS). Observe changes via `stel.change`/`stel.onValueChanged`.
  - Star identity: `obj.designations()` → array of strings including `"HIP <n>"`; `obj.culturalDesignations()` → `{name_native, name_english, name_pronounce, ...}`. Reverse lookup exists in C as `obj_get_by_hip`.
  - Screen-position projection for overlay drawing: the legacy frontend computes screen coordinates for the selection marker — read `apps/web-frontend/src/assets/sw_helpers.js` in the engine repo for the working projection code and replicate it.
  - Star catalog: the engine repo bundles `apps/test-skydata/` (bright-star subset, includes HIP stars + a `skycultures/western` example) — sufficient for the demo; full survey data can come later.
- **Sky-culture format** (current, used by BOTH desktop ≥ v24.4 and the web engine): a directory containing:
  - `index.json`: `{id, region, constellations: [...], common_names: {...}}` + optional `edges`, `thumbnail`, `highlight`, `native_lang`, `illustrations_bscale`.
  - Constellation entry: `id` of form `"CON <culture> <name>"`; **`lines` = array of polylines, each polyline an array of HIP numbers** (connected paths, e.g. `[[98036, 97649, 97278], [97649, 95501]]`); `common_name: {english, native, pronounce, references, context}`; optional `image: {file: "illustrations/x.webp", size: [w,h], anchors: [{pos: [px,py], hip: N} ×3]}`.
  - `common_names` maps `"HIP 91262"` → `[{english, native, pronounce}]` for individual star names.
  - `description.md`: H1 culture name; required H2 sections Introduction, Description, Constellations, References, Authors, License; H5 per-constellation headings.
  - Reference example to imitate: `maori/` in github.com/Stellarium/stellarium-skycultures.
- **Existing indigenous cultures in stellarium-skycultures** (pull these, don't recreate): Polynesian: `hawaiian_starlines`, `maori`, `tongan`, `anutan`. South American: `tukano`, `tupi`, `lokono`, `northern_andes`. Also relevant: `aztec`, `inuit`, `navajo`, `blackfoot`, `kamilaroi`, `boorong`, `bugis`, `mandar`, `siberian`, `sami`.
- **Licensing:** engine + platform code → AGPL-3.0 with visible source link (network-use clause applies). **Culture content is licensed separately** (official repo recommends CC BY-SA or freer) — Phase 2 governance can apply community-appropriate terms to content without touching code licensing. Upstreaming engine changes needs Stellarium Labs' CLA (we don't plan engine changes).

### Data model (pinned now so Phases 2–3 don't force a rewrite)

- **Taxonomy** (`taxonomy.json`, served statically): tree of buckets → sub-buckets → `skyculture_id` (or `null` for "no dataset yet — contributions welcome" placeholders like Rapa Nui, Mapuche, Diaguita, Quechua). Placeholder entries are first-class: they render in the UI and are selectable as targets for authoring.
- **Draft** (backend table): `id, culture_key (taxonomy node id), name_english, name_native, pronounce, lines (JSON: list of HIP polylines), notes, provenance (JSON: {contributor, community, source, permission}), status (default 'draft' — Phase 2 adds 'submitted'/'approved'/'restricted'), created_at, updated_at`. `status` and `provenance` exist NOW even though Phase 1 has no review flow.

### Phasing

- **Phase 1 (this plan):** viewer + authoring demo, draft persistence, Stellarium-format export, round-trip (authored culture loads back into the viewer).
- **Phase 2:** accounts, per-culture steward roles, submission→review→publish, restricted/withheld visibility.
- **Phase 3:** story archive (text/audio/video/images with provenance) attached to stars/constellations.
- **Phase 4:** polished exports, PRs upstream to `stellarium-skycultures`.
Phases 2–4 get their own brainstorm→spec→plan cycles later.
