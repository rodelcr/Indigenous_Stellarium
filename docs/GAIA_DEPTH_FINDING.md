# Deeper stars: what was tried, and where it stopped

**Outcome: not shipped.** The data is mirrored, attributed and wired, and the
engine will not read it. Recording this so the next attempt starts here
rather than at the beginning.

## The problem being solved

The bundled star catalogue stops at `max_vmag = 7.0` — roughly naked-eye. A
community naming a star fainter than that cannot point at it, which is a
contribution blocker rather than a fidelity nicety.

## What was done

`scripts/fetch_surveys.py gaia_dr2_v2 --min-order 3 --max-order 3` mirrored
**768 of 768 tiles at order 3, 62.6 MB**. Order 3 is the survey's coarsest
level (`hips_order_min = 3`); the full survey runs to order 6+ and is
hundreds of gigabytes, so a complete mirror is not possible and hotlinking
`data.stellarium.org` is against this project's own rule.

Attribution is not the obstacle here: the survey carries
`obs_copyright = Guillaume Chereau` and the full ESA/Gaia/DPAC
acknowledgement, so it passes the credit assertion that withholds `dso` and
`dso2`. `deploy/generate_attribution.py` was extended to surface survey
credit in the app's attribution panel, which that acknowledgement requires,
and that work stands regardless.

## Where it stops

The engine fetches `gaia_dr2_v2/properties` (HTTP 200) and then **never
requests a single tile**.

Read from `src/modules/stars.c`, the relevant path is:

- `stars.c:905` — `is_gaia` is set only when the data source's key is exactly
  `"gaia"`. Registering without that key leaves the survey inert; that was the
  first mistake and fixing it changed nothing.
- `stars.c:936` — with `is_gaia` set, the engine raises the survey's
  `min_vmag` to the bright catalogue's `max_vmag`, i.e. 7.0, so Gaia is meant
  to supply only stars fainter than the bundled set.
- `stars.c:756` — a survey is skipped entirely while
  `survey->min_vmag > painter.stars_limit_mag`. So Gaia is consulted only once
  the view's limiting magnitude passes 7.
- `stars_limit_mag` comes from `compute_vmag_for_radius(core->skip_point_radius)`
  (`core.c:543`), driven by `star_linear_scale`, `bortle_index`,
  `exposure_scale` and field of view.

Tried, each verified by watching the network for a tile request:

| Setting | Result |
|---|---|
| fov 8° → 6° → 3° → 1.5° → 1° | no tile request |
| `bortle_index` 3 → 1 | no tile request |
| `exposure_scale` 1 → 3 | no tile request |
| `star_linear_scale` 0.8 → 4 | no tile request |
| registered with `key: 'gaia'` | properties fetched, still no tile request |

## What this suggests

The engine's own reference frontend (`apps/web-frontend/src/App.vue:252`)
loads only `skydata/stars` and never wires a Gaia survey at all. Combined
with the `// XXX: We should remove that` comment sitting on the `min_vmag`
plumbing at `stars.c:934`, the likely reading is that the Gaia path in this
build is vestigial — written for an online survey arrangement that is not
exercised by anything shipping.

## What is kept

- The 62.6 MB mirror, on disk and git-ignored.
- `scripts/fetch_surveys.py` with its `--min-order` flag.
- The `key: 'gaia'` registration in `engine.js`, with a comment on why the
  key matters, so nobody has to rediscover `stars.c:905`.
- Survey credit in the attribution panel, which was needed anyway.

`deploy/exclusions.json` withholds the survey from public builds — not for
want of attribution, but because shipping 62.6 MB that produces no visible
star would be worse than shipping nothing.

## Next things worth trying

1. Instrument `render_visitor` in a debug build to print `stars_limit_mag`
   against `survey->min_vmag`, rather than inferring the gate from outside.
2. Set the survey's `min_vmag` to a low value directly in the mirrored
   `properties` file and see whether tiles then load — that isolates the gate
   from everything else in one step.
3. Ask upstream whether the Gaia survey path is expected to work in the
   current engine, alongside the DSO provenance question in
   `docs/DSO_PROVENANCE_QUERY.md`.
