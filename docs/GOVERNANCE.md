# Governance — draft, pending community input

**Status: this document is a proposal written by the project's builders, not
an agreement reached with any community.** It exists so that people we
approach have something concrete to react to, disagree with, and rewrite.
Nothing in it has been ratified by any of the communities whose knowledge
this platform is meant to hold. Treat every section as a starting position.

If you are reading this as a member of one of those communities: the parts
you most want to change are probably the parts we got wrong.

---

## The problem this is trying to solve

A planetarium that shows indigenous constellations is easy to build and easy
to get wrong. The failure modes are well documented and they are not
technical:

- Knowledge is collected from communities and then held, licensed, and
  relicensed by people outside them.
- An ethnographer's account of a sky becomes the canonical version of that
  sky, because it is the version that was written down in a citable form.
- Material that is seasonal, initiatory, or simply not for public telling
  gets published because the system had no way to represent "not this."
- Attribution decays into a line in a credits file.

A contribution platform that does not plan for these produces them by
default. So the governance model is a functional requirement of the
software, not a policy document bolted on afterwards.

## Principles

We are aiming to align with **CARE** (Collective benefit, Authority to
control, Responsibility, Ethics) alongside the more familiar FAIR principles.
Where the two conflict — and they do — CARE wins here.

In practice, for this codebase:

**Authority to control.** A community decides what of its sky knowledge
appears, in what form, under what terms, and for how long. That includes the
right to withdraw something already published. "Already deployed" is not an
argument against removal.

**Provenance is not metadata, it is the record.** Every draft requires
contributor, community, source, and permission status before it can be
saved — enforced on the server *and* in the browser. A draft without them is
rejected, not stored with blanks.

**No licence is asserted on a community's behalf.** Exports carry "licensing
to be determined by the contributing community." The project's own code is
AGPL-3.0; that says nothing about the content.

**Nothing is invented.** Not a name, not a translation, not a constellation
outline, not an example. Where the record is thin, the artifact is thin.

**Restriction is a first-class state, not an absence.** The data model
carries `status` from day one so that "approved," "restricted," and
"withheld" are representable before there is any content to apply them to.

## The steward model (proposed)

Each culture in the taxonomy gets one or more **stewards**: community members
or cultural practitioners, named by that community, who hold the review
decision for that culture's entries.

Proposed responsibilities:

- Review submissions for that culture before anything is published.
- Set the visibility of each entry: public, restricted, or withheld.
- Set the terms under which that culture's content may be redistributed.
- Ask for content to be corrected or removed, at any time, without needing to
  argue the case.

Deliberately **not** proposed: any role for the project maintainers in
deciding what is culturally correct. Maintainers keep the software running
and implement what stewards decide.

**Open questions we cannot answer ourselves.** How stewards are chosen is a
matter for each community, not for us — but the software has to encode
*something*, and we don't know what. What happens when stewards disagree,
when a community has several legitimate authorities, or when a steward
becomes unreachable, are all unresolved. So is whether "steward" is even the
right word.

## Restricted and withheld knowledge

The premise is that some knowledge should not be in a public sky viewer, and
the platform must be able to hold that fact without holding the knowledge.

Working distinction:

- **Public** — visible to anyone.
- **Restricted** — the entry's existence may be visible; its content is not,
  except to viewers the steward has authorised.
- **Withheld** — not present in the deployed data at all. The right outcome
  for material that should never have been submitted, and the reason
  deletion has to be a real operation, not a flag.

This is the section most likely to be wrong in ways only a community can see.

## Licensing: code and content are separate

**Platform code** — frontend, backend, build and export tooling — is
AGPL-3.0, inherited from `stellarium-web-engine`. The network-use clause
applies: anyone using a deployed instance is entitled to its complete
corresponding source, and every deployment must show a source link.

**Culture content** is licensed separately, per culture, by whoever holds the
right to license it. The project asserts nothing.

This split is already load-bearing. Two sky cultures available upstream —
**Kamilaroi** (CC BY-NC-ND 4.0) and **Lokono** (CC-BY-NC) — are excluded from
every public deployment of this project, because each grants redistribution
permission to a *specific named party* (the Stellarium developers; Stellarium
Labs) and this project is neither. Verbatim non-commercial attributed
redistribution is arguably permitted. We excluded them anyway: a project
premised on consent should not rely on the most favourable reading of someone
else's licence.

The exclusion is enforced in `deploy/exclusions.sh` with a post-copy
assertion that fails the build, not merely a filter that could silently stop
matching.

It costs us something real, which is the point. The Kamilaroi culture
includes *Gawaargay*, the emu — a dark constellation with no line data at
all, rendered from an image anchored to three stars. It is the clearest
demonstration of why the polyline-only authoring model is too narrow. We can
learn from its data *shape* without redistributing its *content*.

Both exclusions are reversible by asking the authors. That ask is worth
making.

## Attribution

Attribution in the deployed app is **generated from each culture's own
`description.md`**, not hand-written for the deployment
(`deploy/generate_attribution.py`). The Authors and License sections are
extracted verbatim. If a section is missing it is reported as missing, never
filled in.

This is deliberate: hand-maintained attribution drifts, and getting someone's
name or licence wrong is a specific, avoidable harm.

## What exists today, and what doesn't

**Exists (Phase 1).** The viewer, the authoring tool, provenance enforcement,
per-culture licence exclusions, generated attribution, export to Stellarium's
native format, and the `status` / `kind` columns that later phases need.

**Does not exist.** Accounts. Stewards. A review queue. Restricted
visibility. Any story archive. **There is no community review of anything
submitted to the current demo**, and the deployed app says so in plain
language rather than implying a process that isn't there.

That gap is why the demo is a demo. It is meant to be shown to communities to
start a conversation about stewardship — not to collect knowledge in the
meantime.

## Roadmap

- **Phase 1** *(complete)* — viewer, authoring, drafts, export, round-trip.
- **Phase 2** — accounts, per-culture steward roles, submission → review →
  publish, restricted/withheld visibility. Also the planetarium tools spec at
  `docs/superpowers/specs/2026-08-22-phase2-planetarium-tools-design.md`.
- **Phase 3** — story archive: text, audio, video, images, each with
  provenance and its own visibility state.
- **Phase 4** — polished exports and, where a community wants it, pull
  requests upstream to `stellarium-skycultures`.

Each phase gets its own design cycle. Phase 2 should not begin until the
steward model has been discussed with at least one community willing to
pilot it — building the review system before knowing who reviews, and on
what terms, would bake in our assumptions at exactly the point they matter
most.

## Known open problems

These are unresolved and are listed here rather than discovered later:

1. **The authoring model is too narrow.** Polylines encode one culture's idea
   of what a constellation is. Dark-cloud constellations, individually named
   stars, and asterisms defined by horizon events at a particular place and
   time are all unrepresentable today. The `kind` column exists to make
   widening non-breaking.
2. **Sacred-site geolocation.** A horizon panorama pins an exact location.
   Some sites must not be publicly geolocated, and the photograph may itself
   be culturally restricted. This needs a data model *before* the feature is
   built, not a patch after.
3. **Contributor language is not recorded.** Drafts store free text with no
   field for which language it is in. The sky-culture format has
   `native_lang`.
4. **Indigenous-language interface support does not exist.** Upstream ships
   translations of culture data into Spanish, German and Japanese — and none
   into the languages the cultures belong to. Because those catalogs don't
   exist to import, this has to be built as a contribution surface where
   speakers author translations with provenance.
5. **Third-party artwork needs permission before it ships.** An Andean
   artist's depiction of the dark-cloud constellations is a better
   representation than any ethnographic account we could render — and using
   it requires asking the living artist, and separately the museum for any
   specific photograph. Using something in a talk and embedding it in a
   deployed application are different acts.

## Contact

Corrections, objections, and requests for removal should go through the
project repository. If something here misrepresents your community's
knowledge or claims a right that isn't ours, say so and it will be changed —
that is a bug report, and it takes precedence over feature work.
