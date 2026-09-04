# Deep-sky survey provenance — draft query for upstream

**Status: NOT SENT.** This is a draft for Rodrigo to review, edit and post
himself, or to authorise. It would be a public issue on
`Stellarium/stellarium-web-engine` under his GitHub account.

## Why it is needed

`data.stellarium.org/surveys/dso` and `.../dso2` are the deep-sky catalogues
the engine reads. They are what makes nebulae and galaxies resolve: the demo
data bundled with the engine is order 0 only (512 KB), while these run to
order 3 (17.3 MB each, 967 tiles apiece) and are the difference between
`getObj('M 31')` returning null and returning Andromeda.

They cannot be shipped in this project because **no attribution is stated
anywhere**, and this project does not publish content it cannot credit.
Checked, all negative:

- `properties` for both surveys carries only technical fields —
  `hips_order_min`, `hips_tile_format`, `hips_release_date`, `type`,
  `source_md5`. There is no `obs_copyright`, no `obs_ack`, no `hips_creator`,
  no `obs_title`.
- No `README`, `readme.txt`, or `LICENSE` beside them on the server (all 404).
- Nothing in the `stellarium-web-engine` repository records what they were
  built from; there is no tool in `tools/` that generates them.

By contrast `surveys/gaia_dr2_v2` carries `obs_copyright = Guillaume Chereau`
and the full ESA/Gaia/DPAC acknowledgement text, and `surveys/dss` carries
`obs_copyright`, `obs_copyright_url` and `hips_creator`. So the fields are
used elsewhere in the same collection — the DSO surveys look like an
oversight rather than a policy.

## Draft issue text

> **Title:** What are the `dso` and `dso2` HiPS surveys built from, and how
> should they be credited?
>
> The surveys at `data.stellarium.org/surveys/dso` and `.../dso2` have no
> attribution metadata: their `properties` files carry no `obs_copyright`,
> `obs_ack` or `hips_creator`, and there is no README or LICENSE alongside
> them. Other surveys in the same collection do carry these — `gaia_dr2_v2`
> has the ESA/Gaia acknowledgement and `dss` credits STScI/NASA and CDS.
>
> I maintain a small AGPL planetarium built on stellarium-web-engine that
> shows indigenous sky cultures, and it has a rule of not publishing data it
> cannot attribute. I would like to use these surveys and currently cannot.
>
> Two questions:
>
> 1. What underlying catalogue(s) are `dso` and `dso2` derived from, and what
>    is the difference between them?
> 2. What acknowledgement should downstream users display?
>
> If it is useful I am happy to open a PR adding `obs_copyright` / `obs_ack`
> to the `properties` files once the answer is known.
>
> Thanks for the engine — it is doing something no other web planetarium can.

## What to do with the answer

Once provenance is established:

1. Record the acknowledgement in this repository.
2. Remove `dso`/`dso2` from `unattributed_surveys` in
   `deploy/exclusions.json`, which is the only thing keeping them out.
3. Rebuild. `pages.sh` asserts on the built bundle that every shipped survey
   states a copyright, acknowledgement or creator, so it will refuse until
   the `properties` files actually carry one.

Everything else is already wired: `scripts/fetch_surveys.py` mirrors them,
`engine.js` registers them, and they work locally today.
