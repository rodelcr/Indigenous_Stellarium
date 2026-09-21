---
title: Indigenous Stellarium
emoji: 🌌
colorFrom: gray
colorTo: yellow
sdk: static
pinned: false
license: agpl-3.0
---

# Indigenous Stellarium

A planetarium in a web browser where **indigenous constellations are the
default view** and the Western/IAU sky is off unless a visitor chooses it.
Community members can also define a constellation by clicking stars, attach
a provenance record, and export it into Stellarium's native sky-culture
format.

This Space is a **mirror of the GitHub Pages deployment** at
<https://rodelcr.github.io/Indigenous_Stellarium/>. Both are built from the
same source commit by the same script and carry identical content; the
`deploy/release.sh` script in the source repository publishes both together
and verifies what landed on each.

## Demo sandbox — please read before contributing knowledge here

- **This Space has no server.** It is a static site. Drafts you author are
  stored in your own browser and never leave your machine. Nothing you type
  here is collected by us.
- **Nothing is reviewed by community stewards yet.** The steward model — in
  which designated members of each culture review submissions before
  anything is published — is a Phase 2 feature and does not exist. Authoring
  here demonstrates the mechanism; it is not a live intake of cultural
  knowledge.
- If you are a community member interested in stewarding your culture's
  entries, please reach out through the source repository rather than
  submitting knowledge through this demo.

The same notice is shown in the app itself.

## Sky cultures shown

Constellation and star-name data for fetched cultures is taken verbatim,
with attribution preserved, from the official
[stellarium-skycultures](https://github.com/Stellarium/stellarium-skycultures)
repository. Cultures authored inside this project cite their sources in
full and are published only after a deliberate decision recorded in the
source repository's `deploy/exclusions.json`. Every shipped culture's
authors and licence are listed in-app and are generated from that culture's
own `description.md`, not hand-written for this deployment.

Some upstream cultures are **not** included because their licence permits
redistribution only by a specific named party (the Stellarium project or
Stellarium Labs), and this project is neither. The app says so in place
rather than removing them from the tree.

## Source code and licence

The platform code is **GNU Affero General Public License v3.0**. It builds
on [`stellarium-web-engine`](https://github.com/Stellarium/stellarium-web-engine),
itself AGPL-3.0. The AGPL's network-use clause applies: **you are entitled
to the complete corresponding source** for the version running here,
including local modifications. That source is
<https://github.com/rodelcr/Indigenous_Stellarium>, and the app links to it.

Sky-culture content is licensed **separately from the platform code**; see
the in-app attribution panel for each culture's terms. Cultures authored in
this project state that licensing is to be determined by the contributing
community — this project asserts none on anyone's behalf.
