// engineProperties.fixture.js — snapshot of every module and scalar property
// present on `stel.core`, enumerated from a LIVE engine instance
// (engine pinned at 5403e930) on 2026-08-25.
//
// Exists so skyLayers.js's paths can be checked without booting WebAssembly:
// a typo in a path is otherwise invisible until someone clicks the control
// and nothing happens, which is the failure mode this table's size invites.
// Regenerate by dumping Object.keys over stel.core in a dev build.
export const ENGINE_PROPERTIES = {
  observer: ['longitude', 'latitude', 'elevation', 'tt', 'utc', 'pitch', 'yaw', 'roll', 'view_offset_alt', 'space'],
  skycultures: ['current_id', 'name_format_style'],
  milkyway: ['visible'],
  dss: ['visible'],
  minor_planets: ['visible', 'hints_mag_offset', 'hints_visible'],
  comets: ['visible', 'hints_mag_offset', 'hints_visible'],
  stars: ['visible', 'hints_mag_offset', 'hints_visible'],
  meteors: ['zhr', 'visible'],
  constellations: [
    'lines_visible', 'labels_visible', 'images_visible', 'bounds_visible',
    'lines_animation', 'show_only_pointed', 'illustrations_bscale', 'unpointed_dim',
  ],
  dsos: ['visible', 'hints_mag_offset', 'hints_visible'],
  planets: [
    'visible', 'hints_mag_offset', 'hints_visible', 'scale_moon',
    'srt_show_orbits', 'srt_show_features', 'srt_full_brightness', 'srt_full_brightness_coef',
  ],
  satellites: ['visible', 'hints_mag_offset', 'hints_visible'],
  landscapes: ['visible', 'fog_visible', 'current_id'],
  atmosphere: ['visible', 'turbidity'],
  lines: ['visible'],
  'lines.azimuthal': ['visible'],
  'lines.equatorial': ['visible'],
  'lines.equatorial_jnow': ['visible'],
  'lines.meridian': ['visible'],
  'lines.ecliptic': ['visible'],
  'lines.equator_line': ['visible'],
  'lines.boundary': ['visible'],
};

/** Scalars that live directly on core. */
export const CORE_SCALARS = [
  'fov', 'projection', 'fps', 'clicks', 'zoom', 'test', 'exposure_scale',
  'star_linear_scale', 'star_relative_scale', 'bortle_index', 'tonemapper_p',
  'display_limit_mag', 'center_hints_mag_offset', 'flip_view_vertical',
  'flip_view_horizontal', 'mount_frame', 'on_click', 'on_rect', 'time_speed', 'y_offset',
];
