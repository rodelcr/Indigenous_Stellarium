---
title: Indigenous Stellarium
emoji: 🌌
colorFrom: gray
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
license: agpl-3.0
---

# Indigenous Stellarium

A web sky viewer that makes **indigenous constellations first-class**
citizens of the night sky — shown by default, alongside (not subordinate
to) the Western/IAU constellations, which are off unless a viewer
chooses them. Community members can also **contribute their own
constellations**: click stars in the sky to define a constellation's
members and line segments, attach a name and provenance record, save the
draft, and export it into Stellarium's native sky-culture format.

This Space is **Phase 1: a viewer + authoring demo**, built to be
showable to communities and potential collaborators so we can recruit
per-culture stewards for the review process described below — it is not
yet a production contribution pipeline.

## Demo sandbox — please read before contributing knowledge here

- **Saved drafts are session/storage-scoped and not guaranteed to
  persist.** This Space runs on Hugging Face's free tier, whose storage
  is ephemeral — a rebuild or restart of this Space can wipe anything
  saved here.
- **Nothing submitted here is reviewed by community stewards.** The
  steward/governance model — where designated members of each culture
  review and approve submissions before anything is published — is a
  Phase 2 feature and does not exist yet. Authoring here is a
  demonstration of the mechanism, not a live intake of cultural
  knowledge.
- If you are a community member interested in stewarding your culture's
  entries in a future version of this project, please reach out through
  the source repository rather than submitting knowledge through this
  demo expecting it to be stewarded.

This notice is also shown in the app itself, not just here.

## Sky cultures shown

Constellation and star-name data is pulled verbatim, with attribution
preserved, from the official
[stellarium-skycultures](https://github.com/Stellarium/stellarium-skycultures)
repository. This project does not invent, translate, or edit any
culture's content. Every shipped culture's authors and license are
listed in-app (button in the corner of the viewer) and are generated
directly from that culture's own `description.md`, not hand-written for
this deployment.

A small number of cultures available in the upstream repository are
**not** included in this deployment because their license permits
redistribution only by a specific named party (the Stellarium project or
Stellarium Labs), and this Space is neither — shipping them here would
contradict the consent-and-attribution premise of the whole project.

## Source code and license

The platform code (frontend, backend, build/export tooling) is licensed
**GNU Affero General Public License v3.0 (AGPL-3.0)**. This project
builds on and links
[`stellarium-web-engine`](https://github.com/Stellarium/stellarium-web-engine),
which is itself AGPL-3.0. The AGPL's network-use clause applies: **you
are entitled to the complete corresponding source code** for the version
of this application running here, including any local modifications. A
link to that source is shown in the app itself; the source also ships
alongside this Space's own files.

Sky-culture content pulled from `stellarium-skycultures` or contributed
by community members is licensed **separately from the platform code** —
see the in-app attribution panel for each culture's specific terms.

## Local development

See the project repository's `README.md` and `docs/DESIGN.md` for the
full build/run instructions (engine build, frontend dev server, backend
API, tests) and the project's design spec. This Space's `Dockerfile` and
assembly script live in that repository's `deploy/` directory.
