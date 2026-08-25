// cityIndex.js — pure search and coordinate handling behind LocationPanel.
//
// The place list is a CONVENIENCE, not the primary way to set a location.
// It is population-ranked (GeoNames cities5000), and measured against the
// real data that means it omits places central to this project: Hanga Roa
// is in it only because the 5,000 threshold was chosen over 15,000, and
// Ollantaytambo, Pisac and Chinchero — Quechua towns in the Cusco region
// whose sky Yana Phuyu describes — are in neither. Latitude/longitude entry
// is therefore a first-class path in the UI, not a fallback. See
// scripts/fetch_cities.py.

/** The engine stores observer latitude/longitude in RADIANS
 *  (observer.c:339-340, TYPE_ANGLE). Getting this wrong puts the observer
 *  57x off and the sky is simply wrong, so it lives here with a test. */
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export const degToRad = (deg) => deg * DEG2RAD;
export const radToDeg = (rad) => rad * RAD2DEG;

/** Strip diacritics and case so "cusco" matches "Cusco" and "hanga roa"
 *  matches "Hanga Roa" — a search box that requires the right accents is
 *  useless for exactly the place names this project carries. */
export function normalize(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Rank places against a query.
 *
 * Ordering is exact name, then prefix, then substring, and population
 * within each band. Without the population tiebreak a query like
 * "Springfield" returns an arbitrary one of dozens.
 *
 * @param {Array<[string,string,number,number,number]>} places
 *   rows of [name, country, lat, lon, population]
 * @param {string} query
 * @param {number} [limit]
 */
export function searchPlaces(places, query, limit = 12) {
  const q = normalize(query);
  if (!q) return [];
  const out = [];
  for (const p of places) {
    const n = normalize(p[0]);
    let band;
    if (n === q) band = 0;
    else if (n.startsWith(q)) band = 1;
    else if (n.includes(q)) band = 2;
    else continue;
    out.push({ band, name: p[0], country: p[1], lat: p[2], lon: p[3], population: p[4] });
    // The list is pre-sorted by population, so once enough exact/prefix
    // hits exist there is no need to scan the whole 70,000 rows.
    if (out.length > limit * 40) break;
  }
  out.sort((a, b) => a.band - b.band || b.population - a.population);
  return out.slice(0, limit);
}

/** "Hanga Roa, Chile" */
export function formatPlace(p) {
  return p.country ? `${p.name}, ${p.country}` : p.name;
}

/**
 * Parse a typed coordinate. Accepts a plain decimal ("-27.15"), and the
 * hemisphere-suffixed form people copy off maps and phones ("27.15 S",
 * "109.43W"). Returns null rather than NaN for anything else, so an
 * unparseable value can never reach the engine and silently move the
 * observer to the Gulf of Guinea.
 */
export function parseCoordinate(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/°/g, '');
  if (!s) return null;
  const m = /^([+-]?\d+(?:\.\d+)?)\s*([NSEW])?$/i.exec(s);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const hemi = m[2] ? m[2].toUpperCase() : null;
  if (hemi === 'S' || hemi === 'W') {
    // "-27 S" is contradictory; treat the sign as already applied rather
    // than negating twice and landing in the wrong hemisphere.
    v = -Math.abs(v);
  } else if (hemi === 'N' || hemi === 'E') {
    v = Math.abs(v);
  }
  return Number.isFinite(v) ? v : null;
}

/** @returns {string|null} a message naming what is wrong, or null if valid */
export function validateLatLon(lat, lon) {
  if (lat === null) return 'Latitude must be a number between −90 and 90.';
  if (lon === null) return 'Longitude must be a number between −180 and 180.';
  if (lat < -90 || lat > 90) return `Latitude ${lat} is outside −90 to 90.`;
  if (lon < -180 || lon > 180) return `Longitude ${lon} is outside −180 to 180.`;
  return null;
}

/** Display form for a coordinate pair, with hemisphere letters so a reader
 *  does not have to remember which sign is south. */
export function formatLatLon(lat, lon) {
  const la = `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}`;
  const lo = `${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`;
  return `${la}, ${lo}`;
}
