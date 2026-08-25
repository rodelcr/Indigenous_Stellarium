// skyLayers.js — declarative table of engine-backed view toggles.
//
// A table rather than one handler per control: there are ~25 of these, they
// are all "read a property, write a property", and hand-writing each one
// invites the same typo 25 times. Every path here was enumerated from a LIVE
// engine instance and cross-checked against vendor/ source — see
// docs/ENGINE_CAPABILITY_AUDIT.md — rather than taken from desktop
// Stellarium's feature list, which describes an application this
// WebAssembly engine is not.
//
// Deliberately ABSENT, so nobody adds it back without reading this:
//   dss.visible — the module exists and is unwired. Turning it on means
//   streaming order-9 tiles from data.stellarium.org on every pan. That is
//   someone else's bandwidth, and this project's own note on the subject
//   says mirror it, don't hotlink. It stays out until there is a mirror.

/** Read a dotted path off stel.core. Returns undefined if any hop is
 *  missing, so a renamed engine property shows as a disabled control rather
 *  than throwing during render. */
export function getLayerValue(core, path) {
  let node = core;
  for (const key of path.split('.')) {
    if (node === null || node === undefined) return undefined;
    node = node[key];
  }
  return node;
}

/** Write a dotted path on stel.core. Returns false (and writes nothing) if
 *  the parent object is missing. */
export function setLayerValue(core, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let node = core;
  for (const key of keys) {
    if (node === null || node === undefined) return false;
    node = node[key];
  }
  if (node === null || node === undefined) return false;
  node[last] = value;
  return true;
}

export const LAYER_GROUPS = [
  {
    id: 'constellations',
    label: 'Constellations',
    layers: [
      {
        id: 'art',
        label: 'Artwork',
        path: 'constellations.images_visible',
        type: 'bool',
        // For a dark-cloud culture the artwork IS the figure: Kamilaroi's
        // Gawaargay carries no lines at all, only an image on three anchors.
        note: 'Some cultures are drawn, not outlined.',
      },
      {
        id: 'bounds',
        label: 'IAU boundaries',
        path: 'constellations.bounds_visible',
        type: 'bool',
        note: 'The 1930 international carve-up of the sky — one convention, not a fact of it.',
      },
      {
        id: 'dim',
        label: 'Dim distant figures',
        path: 'constellations.unpointed_dim',
        type: 'range',
        min: 0.05,
        max: 1,
        step: 0.05,
        note: 'How strongly figures away from the centre fade. 1 draws them all equally.',
      },
    ],
  },
  {
    id: 'lines',
    label: 'Reference lines',
    // Azimuthal and meridian first on purpose: horizon and meridian are what
    // most of the astronomies in this app are organised around, far more
    // than the equatorial grid a Western planetarium opens with.
    layers: [
      { id: 'azimuthal', label: 'Horizon grid', path: 'lines.azimuthal.visible', type: 'bool' },
      { id: 'meridian', label: 'Meridian', path: 'lines.meridian.visible', type: 'bool' },
      { id: 'equator_line', label: 'Horizon line', path: 'lines.equator_line.visible', type: 'bool' },
      { id: 'ecliptic', label: 'Ecliptic', path: 'lines.ecliptic.visible', type: 'bool' },
      { id: 'equatorial', label: 'Equatorial grid (J2000)', path: 'lines.equatorial.visible', type: 'bool' },
      { id: 'equatorial_jnow', label: 'Equatorial grid (of date)', path: 'lines.equatorial_jnow.visible', type: 'bool' },
    ],
  },
  {
    id: 'objects',
    label: 'What is shown',
    layers: [
      { id: 'star_names', label: 'Star names', path: 'stars.hints_visible', type: 'bool' },
      { id: 'milkyway', label: 'Milky Way', path: 'milkyway.visible', type: 'bool' },
      { id: 'dsos', label: 'Deep-sky objects', path: 'dsos.visible', type: 'bool' },
      { id: 'dso_names', label: 'Deep-sky labels', path: 'dsos.hints_visible', type: 'bool' },
      { id: 'planets', label: 'Planets', path: 'planets.visible', type: 'bool' },
      { id: 'planet_names', label: 'Planet names', path: 'planets.hints_visible', type: 'bool' },
      { id: 'orbits', label: 'Planet orbits', path: 'planets.srt_show_orbits', type: 'bool' },
      {
        id: 'scale_moon',
        label: 'Enlarge the Moon',
        path: 'planets.scale_moon',
        type: 'bool',
        note: 'A teaching exaggeration, not the real angular size.',
      },
      { id: 'meteors', label: 'Meteors', path: 'meteors.visible', type: 'bool' },
      { id: 'comets', label: 'Comets', path: 'comets.visible', type: 'bool' },
      { id: 'minor_planets', label: 'Minor planets', path: 'minor_planets.visible', type: 'bool' },
      {
        id: 'satellites',
        label: 'Satellites',
        path: 'satellites.visible',
        type: 'bool',
        note: 'Positions come from 2021-era orbital elements and are long stale.',
      },
    ],
  },
  {
    id: 'conditions',
    label: 'Sky conditions',
    layers: [
      {
        id: 'bortle',
        label: 'Light pollution (Bortle)',
        path: 'bortle_index',
        type: 'range',
        min: 1,
        max: 9,
        step: 1,
        // The most demonstrative control here: 1 is a genuinely dark sky,
        // 9 an inner city. For a project about skies people could once see,
        // moving this is the argument.
        note: '1 is a dark rural sky; 9 is an inner city.',
      },
      {
        id: 'limit_mag',
        label: 'Faintest magnitude shown',
        path: 'display_limit_mag',
        type: 'range',
        min: 1,
        max: 99,
        step: 1,
        note: '99 applies no limit. The bundled catalogue stops near 7 regardless.',
      },
      { id: 'turbidity', label: 'Air clarity', path: 'atmosphere.turbidity', type: 'range', min: 1, max: 40, step: 1 },
      { id: 'fog', label: 'Fog', path: 'landscapes.fog_visible', type: 'bool' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    layers: [
      { id: 'flip_h', label: 'Mirror horizontally', path: 'flip_view_horizontal', type: 'bool' },
      { id: 'flip_v', label: 'Mirror vertically', path: 'flip_view_vertical', type: 'bool' },
    ],
  },
];

/** Projections the engine implements (projection.h:28-36). PROJ_NULL is not
 *  a projection and PROJ_COUNT is a sentinel; neither is offered. */
export const PROJECTIONS = [
  { value: 1, label: 'Perspective' },
  { value: 2, label: 'Stereographic' },
  { value: 3, label: 'Mercator' },
  { value: 4, label: 'Hammer' },
  { value: 5, label: 'Mollweide' },
];

/** Every layer, flattened — for tests and for bulk reads. */
export function allLayers() {
  return LAYER_GROUPS.flatMap((g) => g.layers.map((l) => ({ ...l, group: g.id })));
}
