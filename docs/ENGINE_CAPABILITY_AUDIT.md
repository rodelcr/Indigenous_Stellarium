# Engine capability audit — what the engine exposes vs what the UI exposes

Spec §2e asked for this as "an audit, not a build list". Enumerated from the
**live engine instance** (every module and scalar property on `stel.core`),
not from memory of desktop Stellarium — desktop has features this WebAssembly
engine simply does not carry, and guessing from the desktop feature list
would produce a backlog of things that cannot be built.

Last taken: 2026-08-25, engine pinned at `5403e930`.

## Already exposed in our UI

| Control | Engine property |
|---|---|
| Culture switcher | `skycultures.current_id` |
| Constellation lines / labels | `constellations.lines_visible`, `.labels_visible` |
| Constellation dimming | `constellations.show_only_pointed`, `.unpointed_dim` *(our patch)* |
| Play / pause / rewind / fast-forward | `core.time_speed` |
| Set date, Now | `observer.utc` |
| Observer location | `observer.latitude`, `.longitude` (radians) |
| Ground on/off | `landscapes.visible` |
| Sky glow on/off | `atmosphere.visible` |
| Star names | `stars.hints_visible` |

## Available now, not yet exposed — ranked by what this project is for

**1. Constellation artwork — `constellations.images_visible`**
The single highest-value gap. Several fetched cultures ship illustrations,
and for a dark-cloud culture the artwork *is* the representation: Kamilaroi's
Gawaargay has no `lines` at all, only an image on three anchors. Yana Phuyu
is waiting on exactly this shape. One boolean.

**2. Constellation boundaries — `constellations.bounds_visible`**
Shows the IAU boundary carve-up. Worth having precisely so it can be turned
*off* and discussed: the boundaries are a 1930 convention, not a fact of the
sky, and being able to show that they are one culture's grid is on-message.

**3. Coordinate grids — `lines.{azimuthal,equatorial,equatorial_jnow,meridian,ecliptic,equator_line,boundary}.visible`**
Seven independent toggles. Azimuthal and meridian matter most here: horizon
and meridian are what most indigenous astronomies are actually organised
around, far more than the equatorial grid a Western planetarium defaults to.

**4. Deep-sky objects — `dsos.visible`, `.hints_visible`, `.hints_mag_offset`**
Present and unexposed. Note the bundled demo catalogue is thin (see
CLAUDE.md); this is worth more after a survey swap.

**5. Planets and the Moon — `planets.visible`, `.hints_visible`, `.scale_moon`,
`.srt_show_orbits`, `.srt_show_features`**
Planet labels and orbit lines. `scale_moon` exaggerates the Moon's size,
which is a teaching tool rather than a fidelity one — label it as such if
exposed.

**6. Limiting magnitude / brightness — `core.display_limit_mag`,
`.bortle_index`, `.exposure_scale`, `.star_linear_scale`, `.star_relative_scale`**
`bortle_index` simulates light pollution. For a project about skies people
could once see, "here is your sky at Bortle 8, here it is at Bortle 2" is a
genuinely strong demonstration.

**7. Milky Way and DSS imagery — `milkyway.visible`, `dss.visible`**
`dss` is present and never loaded. Loading it is the data-source swap already
documented in CLAUDE.md — the route to a Milky Way where dust lanes resolve,
which is what dark-cloud constellations need to be legible at all.

**8. Meteors — `meteors.visible`, `.zhr`**
Shower rate. Niche, but cheap.

**9. Minor planets, comets, satellites — `.visible`, `.hints_visible`**
Low value here, and the bundled TLEs are stale (the console fills with
"Satellite position error" from 2021-era data). Turning satellites **off** by
default is arguably the better change.

**10. View geometry — `core.projection`, `.flip_view_vertical`,
`.flip_view_horizontal`, `.mount_frame`, `.fov`**
Projection switching (stereographic, etc.) and an equatorial/azimuthal mount
toggle. `fov` is already driven by scroll; explicit zoom presets would help
on touch.

**11. `atmosphere.turbidity`, `landscapes.fog_visible`, `landscapes.current_id`**
`current_id` matters more than it looks: the engine can hold several
landscapes. Only Guéreins ships, and a French village horizon under a Rapa
Nui sky is its own small wrongness — but real landscapes need the HiPS
tiling pipeline the spec put out of scope.

## Not in this engine

Checked and absent, so no backlog entry: `telescope`, `markers`, and any
ocular/telrad simulation; script/scene playback; light-pollution overlays
beyond `bortle_index`; artificial-satellite prediction UI; and the plugin
system generally. Desktop Stellarium has these; this engine does not.

Search is also **not** an engine capability in the useful sense —
`getObj(name)` is a local in-memory lookup over loaded data, and it returns
null for objects whose tiles are not loaded. The engine's own reference
frontend calls out to a Simbad-backed web service for its search box. Spec
§2a records this; do not present `getObj` as "search anything".

## Suggested order

Items 1–3 are all single booleans against properties already verified
present, and 1 and 3 are the two that most change what this project can
*say*. They are the natural next increment.
