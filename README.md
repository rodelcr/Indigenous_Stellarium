# Indigenous Stellarium

A web sky viewer that makes indigenous constellations first-class citizens
of the night sky — shown by default, alongside (not subordinate to) the
Western/IAU constellations, which are off unless a viewer chooses them.
Community members can also **contribute their own constellations and
stories**: click stars on the sky to define a constellation's members and
line segments, attach names and provenance, and (in later phases) attach
richer story media. Knowledge is organized in a hierarchical culture
taxonomy (e.g. Polynesian and South American cultural buckets, extensible
to more regions) rather than flattened into one undifferentiated list.

This repository does not define which cultures or stories appear — that is
the point of the contribution mechanism. Constellation and story content is
never invented here; it comes only from the official
[stellarium-skycultures](https://github.com/Stellarium/stellarium-skycultures)
repository (with its attribution preserved) or from content authored and
submitted by community contributors through this platform.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full project spec (goals,
decisions, data model, and the verified `stellarium-web-engine` API notes
this project builds on).

## Architecture

- **Engine:** [`stellarium-web-engine`](https://github.com/Stellarium/stellarium-web-engine)
  (C, compiled to WebAssembly) — the rendering core.
- **Frontend:** Vue 3 + Vite, driving the compiled engine directly (the
  engine repo's own Vue-2-era frontend is used only as a reference).
- **Backend:** FastAPI + SQLite, for persisting authored constellation
  drafts.
- **Export tooling:** Python scripts that convert authored drafts into
  Stellarium's native sky-culture format (`index.json` + `description.md`),
  consumable by both this viewer and desktop Stellarium ≥ v24.4.

## License

The platform code in this repository (frontend, backend, build/export
tooling) is licensed under the **GNU Affero General Public License v3.0
(AGPL-3.0)** — see the license terms at
<https://www.gnu.org/licenses/agpl-3.0.html>. This project builds on and
links `stellarium-web-engine`, which is itself AGPL-3.0.

The AGPL's network-use clause applies to this platform: **anyone who
interacts with this application over a network is entitled to the
corresponding source code**, including any modifications running on the
service. The source for this project is available at the repository this
README ships in; if you deploy a modified version, you must make your
modified source available to your users as well.

Culture content (constellation data, names, stories) pulled from
`stellarium-skycultures` or contributed by community members is licensed
**separately from the platform code** — see the governance and licensing
notes in `docs/DESIGN.md` and (once written) `docs/GOVERNANCE.md`. Do not
assume AGPL terms apply to culture content.

## Building the engine

The engine has no prebuilt npm/WASM artifact — it must be compiled locally
from C source with [Emscripten](https://emscripten.org/) and
[SCons](https://scons.org/):

```sh
./scripts/build_engine.sh
```

This clones `stellarium-web-engine` into `vendor/` (git-ignored), builds it
with `make js`, and stages the resulting `stellarium-web-engine.js` /
`.wasm` plus the bundled `apps/test-skydata/` star catalog into
`build-artifacts/` at the repo root (git-ignored). See the comment at the
top of the script for why a staging directory is used instead of writing
directly into `web/public/` — the `web/` app itself is scaffolded in a
later task, after this build step exists.

Requires `emcc` (Emscripten) and `scons` on `PATH`; install with
`brew install emscripten scons` if missing.

## Status

Phase 1 (viewer + authoring demo) is in progress. See `docs/DESIGN.md` for
the full roadmap.
