# NOTES — whole-branch review, 2026-10-05

First whole-branch review of `phase1-viewer-authoring` (root `718335d` → `649dd7b`,
119 files, +16.5k lines). Three read-only reviewers by area: deploy/exclusions,
contribution path, viewer/engine/content. Tests at review time: 235 vitest + 77
pytest, all green. Findings below were spot-verified in code by the coordinator
unless marked (unverified).

Status (2026-10-06): **Batches 1 and 2 fixed and released; Batches 3–4 and the content
checks open.** Repo-visibility decision (D-C2): keep the withheld drafts in the public
repo and document it (Rodrigo) — done in README + `exclusions.json` `_source_repo_note`.

What landed for Batch 1: `deploy/verify_bundle.py` (one artifact check, run by build and
both publishers, with a `build.json` stamp of SHA + dirty + exclusions hash); every content
path an allowlist (`fetched_skycultures_published`, `bundled_engine_data` added); exporter
moved to `data/skycultures_exported/` with a sentinel and key validation, heading injection
escaped; Pages publish verifies tree hash + live site; pipefail grep fixed; host-divergence
message in release.sh; Space front matter `license: other`; "Engine and sky data" credit
section (says plainly that upstream states no per-item credit); `origin` per culture
(fetched / authored / exported). Batch 2: all seven items, plus the Osage request now lists
all 14 names and the further star words, with a dated correction note.
Not done from Batch 1: the minor AGPL-link fallback vacuity, release.sh diff excludes
matching at any depth, unpinned upstream fetch ref.
Open question for Rodrigo: the object card still shows a quiet catalogue row (HIP/NGC)
at the bottom — a deliberate "last and quiet" design. Is that within hard rule 6?

## Batch 1 — publish-safety (the project's worst-failure class)

| # | Finding | Where |
|---|---|---|
| D-C1 / B-C1 | Fetched set is copied by **denylist** from `web/public/skycultures/`, which also receives export output (`export_skyculture.py` DEFAULT_DEST) and never-cleaned dev-staged drafts. A withdrawn/renamed authored draft or any exported contributor draft ships to both hosts with every guard passing (reproduced by sim). Export to a real culture key (e.g. `maori`) `rmtree`s the upstream dir and replaces it. | `deploy/build_static.sh:89-106`, `deploy/exclusions.sh`, `scripts/export_skyculture.py:52,358-362`, `scripts/stage_authored_dev.sh` |
| D-C2 | Repo is **PUBLIC**; `data/skycultures_authored/{ojibwe,dakota,yana_phuyu}` are on origin. Pending-consent content is public via source even though the app withholds it. **Rodrigo's decision.** | git |
| B-I1 | Contributor `notes` can inject a `## License` section that `generate_attribution` picks up as the culture's licence (reproduced). | `export_skyculture.py:218-314` |
| D-I3 | Remote exclusion check `git ls-tree \| grep -q` under pipefail fails open on SIGPIPE (rc 141). | `deploy/publish_pages.sh:97-104` |
| D-I4 | Pages publish verifies file count only; no live-site check. | `deploy/publish_pages.sh:88-95` |
| D-I6 | Publishers re-check only 2 of build's guards; no build stamp (SHA + exclusions hash). | `publish_pages.sh`, `publish_space.sh` |
| D-I7 | Attribution check is id-only; null/TODO licence passes. | `build_static.sh:204-211` |
| D-I9 | Space README front-matter `license: agpl-3.0` asserts AGPL over community content. | `deploy/README_space.md:8` |
| D-I10 | Survey credit check is substring; milkyway/sso hardcoded exempt; `skydata/{dso,stars,landscapes}` unguarded. | `build_static.sh:187-196`, `exclusions.sh:247-270` |
| D-I11 | Guards untested; `test_every_deploy_builder_filters_the_taxonomy` passes vacuously on a comment. | `tests/` |

## Batch 2 — false or internal text in front of viewers (live now)

- `skyLayers.js:86` — "Horizon line" toggles **`lines.equator_line`** (celestial equator).
- `objectInfo.js:115` — `CON <culture> <id>` and `HIP n` leak as titles/secondary names (28 English-only fetched figures).
- `engine.js` — `stars.hints_visible` never turned off at boot → Western star names on first load.
- `InfoPanel.vue:165-176` — "None of it is written by us" — false; Osage is compiled here.
- `docs/OSAGE_REVIEW_REQUEST.md` — says "Six names… Nothing else"; live description.md publishes 8 more (Day-star, Night-star, Male/Female Star, The great star, Star-moving-not, God of Day, Goddess of Night).
- `AuthoringPanel.vue:408` — HIP numbers rendered in contributor UI; `loadDraft` clears names so HIP is the only label.
- `AuthoringPanel.vue:521` — "Nothing was sent anywhere" false on the non-static 404 path.

## Batch 3 — contribution-path correctness

- Export ids collide (same English name → same `CON` id; Save-after-Load always POSTs a copy) and are positional for unnamed drafts. `culture_key` unvalidated (`"../../etc"`, `""` → `rmtree(dest)`).
- Overlay hard-codes stereographic; projection switcher + flip flags break it.
- BOM/ZWSP-only provenance accepted (server/client diverge on BOM).
- `lines` coerces bools/strings, accepts `[]`, `[5]`, negatives.
- Exporter ignores `status` (Phase 2 `restricted` would export).
- UI requires both English and native names → pressure to invent one; dark constellations unauthorable.
- No auth/ownership on backend — fine only while localhost-bound.

## Batch 4 — viewer UX

- `waitFor` 60-frame cap: culture click during slow boot / first culture load silently dropped.
- `autoFrame.js` zooms on view centre, not the figure (should `pointAndLock`).
- Coordinate hint shows U+2212 minus; parser rejects it.
- No `@media` queries; 375 px layout collapses (ControlBar width negative).
- "Dim distant figures" gated on `iau` field → inert for every indigenous culture (patch change + rebuild).
- Minors: horizon remove button lost after rejected file; duplicate "Also called"; half-init engine visible after failed boot; stale Gaia comment; a11y (glyph-only buttons, no aria-current, no Escape); EB Garamond subsets lack U+0323/U+207F; house-style drift vs CLAUDE.md (EB Garamond, active-row fill, gradient mask).

## Content to check against printed sources (flag only — do not "correct" from memory)

- D(L)akota `CanHdGleska` "Çaŋ Hd / Gleṡka Wakaŋ" — likely one name with hd/gl alternation split by extraction.
- D(L)akota ç (cedilla) vs ċ (dot) — likely arXiv text-extraction artifact.
- Ojibwe "Fischer" — probably "Fisher"; check Lee 2013 Table 1.
- Osage names cite La Flesche at volume level only (1928 vs 1932 not per-name).
- yana_phuyu "Tinamou (second)" puts a compiler disambiguator in a gloss field.

## Verified OK

No SQL injection; no XSS (markdownLinks escapes before v-html); provenance enforced on POST and PUT; 422 never falls back to local; status/kind not client-settable; HIP patch correct and pinned; units (rad, MJD, UTC) correct; 13/13 HIP spot-checks correct; no invented geometry.

## Doc drift

CLAUDE.md: "confirm all three patches" (five exist); dimming guard shares the generic marker; "Consolas first" vs EB Garamond prose; comments still reference removed `deploy/pages.sh`.
