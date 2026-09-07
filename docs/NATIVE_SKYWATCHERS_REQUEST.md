# Ojibwe and D(L)akota sky knowledge in Indigenous Stellarium — request for review

**Status: DRAFT. Not sent.**

For Rodrigo to send by hand, to Native Skywatchers
(nativeskywatchers@gmail.com, the address published on
nativeskywatchers.com) and, separately, to the Ojibwe and D(L)akota
communities and language departments whose knowledge this is.

Two addressees, not one, and on purpose. Native Skywatchers stewards the
maps and the guidebooks. The star knowledge itself belongs to Ojibwe and
D(L)akota people. A yes from one is not a yes from the other.

---

## What the project is

Indigenous Stellarium is a web planetarium in which indigenous constellations
are the default view and the Western/IAU sky is off unless a visitor chooses
it. It is built on the open-source Stellarium web engine. It is not
commercial, carries no advertising, and sells nothing.

It also has an authoring surface: community members can define a
constellation by clicking stars and attach provenance to it, so that
contributions can be made by the people whose knowledge it is rather than
transcribed from them.

## What is currently published as Ojibwe and D(L)akota

**Names and their English translations. Nothing else.**

- **Ojibwe** — 9 named figures (Mooz, Biboonkeonini, Mishi bizhiw,
  Madoodiswan, Ajiijaak / Bineshi Okanin, Noondeshin Bemaadizid, Nanaboujou,
  Maang, Ojiig), plus Ojibwe names attached to Polaris (Giwedin'anung) and to
  the Pleiades (Bugonagiizhig, Madoo'asinik).
- **D(L)akota** — 21 named figures, plus D(L)akota names attached to Sirius,
  Polaris, Arcturus and the Pleiades.

Each is shown with its translation and a citation. The full text of each sky
culture as published is in `data/skycultures_authored/ojibwe/description.md`
and `data/skycultures_authored/dakota/description.md`.

## What is deliberately not published

- **No constellation outlines.** No lines are drawn for any figure, in either
  culture. The papers give each figure's name and which Greek constellation
  it overlaps, but not which stars form it — that is in the star-map artwork.
  Rather than infer a shape from "Leo, Hydra" or "Orion, Canis Minor,
  Taurus", we drew nothing. An invented outline under a nation's name would
  be worse than an empty entry.
- **No artwork.** Neither the *Ojibwe Giizhig Anung Masinaaigan* nor the
  *Makoċe Wiċaŋḣpi Wowapi* is reproduced, in whole or in part, at any
  resolution. Neither are the constellation guidebooks.
- **No teachings and no stories.** The published papers carry short teachings
  for several figures. They are not retold. Lee (2013) records that
  Nanaboujou stories are traditionally told only when there is snow on the
  ground; that is a protocol stated in the source itself, and the way to
  respect it here is not to carry the stories at all.
- **No claim of a licence.** Both sky cultures state that licensing is to be
  determined by the communities and by Native Skywatchers. This project
  asserts no rights over any of it.

## Where it comes from

Two open-access papers, and only those:

1. Lee, A. S. 2013, *Native Skywatchers and the Ojibwe Giizhig Anung
   Masinaaigan – Ojibwe Sky Star Map*, ASP Conference Series 473, 29.
   arXiv:2008.13214
2. Lee, A. S. 2016, *Ojibwe Giizhiig Anung Masinaaigan and D(L)akota Makoċe
   Wiċaŋḣpi Wowapi: Revitalization of Native American Star Knowledge, A
   Community Effort*, Journal of Astronomy in Culture 1(1). arXiv:2008.08224

The names come from Table 1 and section 3.2 of the first, and Appendices A
and B of the second.

We are aware that "publicly readable" is not "licensed". Both papers are
distributed under the arXiv non-exclusive distribution licence, which grants
arXiv the right to distribute them and grants us nothing. Names and factual
identifications are not, in themselves, copyrightable — but that is a
statement about copyright law, and it is not the question we are asking. The
question is whether the people this knowledge belongs to want it here.

We have not read, and have not used, the star maps or the two constellation
guidebooks, which are © Native Skywatchers and sold.

## What we are asking

Any of these is a complete answer, and none of them needs to be justified to
us:

1. **Remove it.** We take both sky cultures down. No explanation required, no
   discussion, no follow-up questions from us.
2. **Correct it.** Names, orthography, translations, seasonal groupings,
   attribution — tell us what is wrong and we fix it. The diacritics in
   particular were transcribed from PDFs and have not been checked by a
   speaker.
3. **Narrow it.** Keep some figures, remove others. Several of these are
   ceremonial — Madoodiswan, Inipi, Gleṡka Wakaŋ, Oċeti Ṡakowiŋ, Tayamni,
   Bugonagiizhig — and if any of them should not be displayed publicly, say
   which and they go.
4. **Leave it as it is.**
5. **Extend it** — if, and only if, the communities want that. The obvious
   next thing the app cannot do is draw the figures, because we will not
   guess at their shapes. If Native Skywatchers and the communities wanted
   the outlines shown, we would need the star lists, and we would want them
   given rather than reconstructed.

We would also like to credit this correctly. At present the sky cultures
credit Annette S. Lee, William Wilson, Carl Gawboy and Jeff Tibbetts
(Ojibwe), and Annette S. Lee, Jim Rock and Charlene O'Rourke (D(L)akota),
and state that the knowledge is held by Ojibwe and D(L)akota people rather
than by any researcher or by this project. If that is wrong, or incomplete,
or if named individuals would rather not be listed, tell us.

## Practical notes

- Removal is one line in `deploy/exclusions.json` and takes minutes, not a
  release cycle.
- Nothing here is on a schedule. There is no launch date this is blocking.
- Until we hear back, these two sky cultures are staged **locally only** and
  are not part of any public deployment.
