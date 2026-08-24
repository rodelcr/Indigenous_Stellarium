# HANDOFF — Indigenous Stellarium, Phase 1 + Yana Phuyu

**Date:** 2026-08-24
**Branch:** `phase1-viewer-authoring` (never worked on main)
**HEAD at handoff:** `120d8e3`
**Written immediately before an OS update + `/compact`.**

---

## TL;DR

A working planetarium viewer where **indigenous constellations are the default and Western/IAU is off** unless chosen. 13 sky cultures render. Stars are clickable and show their name *in the active culture* first, catalogue number second. Constellations can be authored by clicking stars, drafts persist, and authored cultures export to Stellarium's native format and load back into the viewer.

**Headline numbers**
- **8 of 9 planned tasks complete**, each through implement → review → fix → scoped re-review.
- **110 tests passing** — 68 frontend (vitest), 42 backend/scripts (pytest). Production build clean.
- **16 sky-culture directories on disk**; 13 shippable, 2 excluded on licence grounds, 1 authored here.
- **3 engine patches** carried against a codebase frozen since Dec 2021, all reproducible from a clean clone.

**Not done:** the whole-branch review. (Task 9 and the deploy landed later the
same day — see the addendum at the end of this file.)

---

## What this arc produced

### Phase 1 (Tasks 1–8, complete)
1. **Engine build** — `stellarium-web-engine` (C, AGPL-3.0, dormant since Dec 2021) compiles to WebAssembly against **emcc 6.0.6 / SCons 4.11**, via three patch files applied by `scripts/build_engine.sh` with idempotency guards.
2. **Viewer** — Vue 3 + Vite shell; `web/src/engine.js` owns engine lifecycle, `App.vue` stays thin.
3. **Culture ingestion** — `scripts/fetch_skycultures.py` pulls cultures verbatim from the official repo; `data/taxonomy.json` groups them and marks communities with no dataset yet as first-class placeholder nodes.
4. **Culture switcher** — collapsible tree; placeholders are selectable invitations to contribute, not disabled rows.
5. **Star selection** — click a star, see its identities.
6. **Authoring** — click stars to build constellation polylines, with a live canvas overlay and a required-provenance form.
7. **Persistence** — FastAPI + stdlib `sqlite3`, no ORM.
8. **Export** — drafts → native `index.json` + `description.md`, round-tripping back into the viewer.

### Yana Phuyu (new, `120d8e3`)
The **first sky culture authored inside this project** rather than fetched. Eight Andean dark-cloud figures — Mach'acuay, Hanp'atu, Yutu, Yacana, Uñallamacha, Atoq, Yuthu, Micheq — with names, orthographic variants and cited descriptions, at `data/skycultures_authored/yana_phuyu/`.

**Deliberately no `lines` and no `image`.** Dark constellations are dust lanes silhouetted against the Milky Way; the literature describes them in prose, not coordinates. Inventing outlines to make them render would have put fabricated geometry under a community's name.

Sources actually retrieved and read: Urton 1981 (*PAPS* 125(2):110–127, full scan read page by page); Gullberg et al. 2020 (*JAHH* 23(2)) via CONICET; Smithsonian NMAI *Great Inka Road* via Wayback; Pinasco 2024 (*Cosmovisiones* 5(1)) via SEDICI; NASE/IAU slides (orthographic variants only); SIMBAD for HIP ids. Sources known only second-hand (Huarochirí, Garcilaso, Polo de Ondegardo, Cobo) are listed separately as such. Stellarium upstream has **no** Inca/Quechua culture, so this is not a duplicate.

Taxonomy entry is `skyculture_id: null, placeholder: true` — a culture with no renderable content should not present as loadable. Only two star names are attested and shipped: α/β Centauri as *Llamacñawin* (HIP 71683 / 68702, verified in SIMBAD).

**Two caveats to carry, flagged by the author, not discovered later:**
1. The single star-anchored extent in the whole literature — Mach'acuay reaching "from a point near the Southern Cross to Adhara" — **rests on Urton 1981 p. 118 alone**, and the copy consulted was a third-party mirror of a JSTOR scan (genuine per its cover sheet) rather than a publisher or repository copy. Worth confirming against a library copy before this claim travels further.
2. Orthography is frozen at Urton's **pre-normalisation 1981 spellings**. A Quechua reviewer will likely want these revised; a variants table is included so that is a one-line edit rather than a rewrite.

I spot-checked two citations myself rather than take them on trust: DOI `10.24215/26840162e021` resolves to a real article, and the Smithsonian page carries the artist name, birth year, medium and date exactly as cited. Urton's JSTOR SICI and the CONICET handle remain unverified by me.

---

## Key insights (the things worth not rediscovering)

**The bundled sky data is a demo set, and that one fact explains three separate symptoms.** Stars are capped at `max_vmag = 7.0`; the Milky Way is `hips_order = 0` (132 KB, one tile level — dust lanes are *unresolvable*, not merely faint); and `stel.getObj()` returned **null for all 14 deep-sky designations tested** (M31, "M 31", NGC 224, M87, M51, Centaurus A…). Treat these as one problem.

**And the fix is a data-source swap, not engine work.** `eph` is the proprietary format for *star catalogues only* — **image surveys are plain standard HiPS**. Verified live: CDS serves DSS colour at **order 9**, and `data.stellarium.org` publicly serves `surveys/gaia_dr2_v2/`, `surveys/dss/`, `surveys/milkyway/`, `surveys/dso/` in exactly the formats this engine reads. The engine already has a `dss` module we simply never load.
*Caveats:* someone else's bandwidth (mirror for production); order-9 needs network on every pan, losing offline use; DSS attribution to STScI/NASA + CDS is required.

**Catalogue numbers are a storage format, never an interface.** HIP ids must stay internally — Stellarium's constellation `lines` *are* HIP arrays, and abandoning that forfeits export and upstreaming. But no contributor should read one. The engine hands us human names alongside: Arcturus returns `["Arcturus", "* alf Boo", "* 16 Boo", "HIP 69673"]`.

**An engine patch was needed to make authoring possible at all.** `star_get_designations()` only synthesised `"HIP n"` as a *fallback* for stars with no other ids, so named stars carried no HIP designation and object→HIP was unreachable from JS. Patched to always emit it (`scripts/hip-designation.patch`). Without this the authoring tool cannot work.

**Subagents cannot answer permission prompts.** A gated command (`npm install`, `pip install`) inside a subagent hangs silently and forever — no error, no timeout. This killed several agents before diagnosis. **Front-load installs in the main session; forbid subagents from running them.**

**Judge agent liveness by its last output, not by filesystem quiescence.** These tasks spend long stretches in browser verification with nothing to show on disk. I killed three healthy agents on this misread.

---

## State on disk

**Committed, tree clean at `120d8e3`.**

Generated / git-ignored (regenerate, don't hunt for them):
- `vendor/stellarium-web-engine/` — clone; `scripts/build_engine.sh` recreates and patches it
- `web/public/engine/*.{js,wasm}` — build output
- `web/public/skydata/` — 4.5 MB demo sky data
- `web/public/skycultures/` — 20 MB fetched cultures; `scripts/fetch_skycultures.py` re-fetches
- `backend/drafts.sqlite`, `backend/.venv/` (has fastapi, uvicorn, pytest, httpx)

Working records in `.superpowers/sdd/we-need-to-build-cheerful-cosmos/` (git-ignored): `progress.md` is the full decision ledger with every ruling; per-task reports; `handoff-phase2-agent.md`; screenshots.

---

## Outstanding work

**1. Task 9 — project docs.** `CLAUDE.md`, `docs/GOVERNANCE.md`, README with attribution. Not started.

**2. Whole-branch review.** Never run. Deferred minors are listed in `progress.md`.

**3. Deploy to GitHub Pages.** Docker Spaces are paywalled (HTTP 402 on both `rodelcr` and `AstroAI-CfA`); only Static Spaces are free. `4d78dbb` added a localStorage fallback so a **fully static deploy now works**, which makes GitHub Pages (`rodelcr.github.io`) the natural target — and it's what was originally asked for. Must carry: the two licence exclusions, visible attribution, an AGPL source link (§13 network-use is a licence obligation), and a demo-sandbox notice.

**4. Localisation — a real gap, not polish.** No i18n exists, and `engine.js:101` passes `translateFn: (domain, str) => str`, a no-op — **we downloaded 105 `.po` catalogs per culture and discard them**, including a populated `es.po` ("Andes del Norte", "El Jaguar"). Worse: **no indigenous language catalog is populated at all**; `haw.po` and `mi.po` don't exist. *The Māori sky culture can be read in Spanish, German and Japanese — but not in Māori.* That asymmetry is what this project exists to correct, and it means indigenous-language support must be a **contribution surface** (translations authored by speakers, with provenance) rather than an import.

**5. Phase 2 spec** at `docs/superpowers/specs/2026-08-22-phase2-planetarium-tools-design.md`, approved. Two facts already resolved for its plan: observer lat/lon are **radians** (`lat * DD2R`); `dateToMjd(d) = d.getTime()/86400000 + 40587`.

---

## Open decisions for Rodrigo

**The painting — identified.** Almost certainly **Miguel Araoz Cartagena** (b. 1977, living Cusco artist), *The Milky Way*, oil on canvas, 2014; the Smithsonian NMAI *Great Inka Road* exhibition keyed its constellation descriptions to it. Controller-verified against the archived Smithsonian page. **Two permissions likely needed:** the artist for the artwork, and the museum/Smithsonian for any specific photograph (exhibition photo credited to Doug McMains). The format already supports it — `image` + three HIP `anchors`, exactly how Kamilaroi's Gawaargay renders. The slot is deliberately empty.

**Licence exclusions.** `kamilaroi` (CC BY-NC-**ND**, permission named to *Stellarium developers*) and `lokono` (CC-BY-NC, permission named to *Stellarium Labs*) are excluded from any public deploy. Both name a redistributor who isn't us. Reversible with a direct ask to their authors — worth making, since the Kamilaroi exclusion costs us Gawaargay, the best example of why the authoring model needs widening.

**The authoring model is too narrow.** Polyline-only encodes one culture's idea of a constellation. Yana Phuyu's eight line-less figures and Kamilaroi's Gawaargay are the proof. Also unrepresentable: individually named stars, and asterisms tied to horizon events. The `kind` column (default `'polyline'`) exists to make widening non-breaking.

**Sacred-site geolocation.** A horizon panorama pins an exact location; some sites must not be publicly geolocated, and the photograph may itself be culturally restricted. Phase 2 §2d as written has no location-privacy handling. **Needs the data model before the feature is built**, not patched after.

**Contributor language.** Drafts store free text but record **no field for which language it was written in**. The sky-culture format has `native_lang`. Add alongside `kind` before real contributor rows exist.

---

## Resuming

1. `git log --oneline -12` and `.superpowers/sdd/we-need-to-build-cheerful-cosmos/progress.md` — the ledger holds every ruling and its cost-if-wrong.
2. `scripts/build_engine.sh` then `scripts/fetch_skycultures.py` to regenerate ignored artifacts.
3. `cd web && npx vitest run` (68) and `backend/.venv/bin/pytest tests/ backend/ -q` (42).
4. **Never run installers in a subagent.** Front-load them.


---

# ADDENDUM — Task 9 and the GitHub Pages deploy (same day, after the OS update)

**Live at <https://rodelcr.github.io/Indigenous_Stellarium/>.** Source:
<https://github.com/rodelcr/Indigenous_Stellarium> (public, AGPL-3.0),
default branch `phase1-viewer-authoring`, build artifact on `gh-pages`.

**Phase 1 is 9/9. 128 tests passing** (74 frontend, 54 backend/scripts),
up from 110.

## Task 9 — `d011375`

`CLAUDE.md`, `docs/GOVERNANCE.md`, and a rewritten `README.md`. The
governance draft says in its first line that it is a proposal written by the
builders and ratified by nobody, and it ends with five open problems it
cannot resolve alone rather than leaving them to be found later.

## Deploy — `c6e081a`

**A real defect surfaced while wiring this up.** `kamilaroi` and `lokono`
carry **live `skyculture_id`s in `data/taxonomy.json`** while their
directories are excluded from every deploy — so both rendered as clickable
cultures that silently failed to load. **This affected the existing container
deploy too**; `assemble.sh`'s note said "verify no OTHER excluded id is wired
in", and two were.

Fixed by `deploy/filter_taxonomy.py`. The interesting part is what it
deliberately does *not* do:

- **It does not delete the node.** Quietly removing a community is the wrong
  answer for a project about visibility, and it would hide an unresolved
  licence question.
- **It does not mark it a placeholder.** That badge reads "no dataset yet —
  help us build it", which is **false**: the data exists and is published
  upstream. Saying otherwise misrepresents the community's record and could
  invite someone to re-contribute knowledge already recorded.

It clears `skyculture_id`, marks `excluded: true`, and states the reason
verbatim. `CulturePanel.vue` renders it as a non-interactive entry.

**The exclusion list now lives in `deploy/exclusions.json`**, read by both
shell deploy paths and the taxonomy filter. A licence exclusion that applied
to one deploy and not another would look fine while being the worst failure
this project has.

**Two claims in the app were wrong for a static deploy**, both inherited from
the Hugging Face Space copy, both now injected at build time:
1. The **AGPL-3.0 source link pointed at a Hugging Face Space**. That is a
   §13 obligation, not a courtesy link.
2. The storage text described **ephemeral server storage**. The static build
   has no backend; drafts never leave the visitor's browser. Stronger claim,
   and getting it backwards is a consent problem, not a copy nit.

**Base paths.** Every asset was root-absolute, which 404s under a Pages
project subpath. `web/src/assetUrl.js` routes them through
`import.meta.env.BASE_URL`. The doubled-slash case is unit-tested *because it
cannot appear in dev*, where the base is `/`.

**`pages.sh` verifies the artifact, not the intent:** no excluded culture in
the output, no taxonomy entry pointing at unshipped data, attribution
matching the shipped set exactly, the AGPL link actually present in the
bundle, `index.html` referencing the base. Building and publishing are
separate commands on purpose.

**Verified live**, not just locally: Māori's `index.json` serves 6
constellations with real HIP polylines, `kamilaroi/index.json` returns 404,
and the deployed taxonomy marks exactly `lokono` and `kamilaroi` as excluded
with 13 loadable cultures. One false alarm along the way — the first
screenshot showed a blank sky, which was a cold cache mid-load, not a bug.

## What is still open

1. **The whole-branch review has never been run.** Deferred minors are in the
   ledger.
2. **Localisation** — `engine.js` still passes a no-op `translateFn`.
3. The four decisions for Rodrigo listed above are unchanged: the Araoz
   Cartagena permissions, the two licence exclusions (worth asking — the
   Kamilaroi exclusion costs us Gawaargay), widening the authoring model
   beyond polylines, and sacred-site geolocation before the horizon feature
   is built.
