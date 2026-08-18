// starDisplayName.js — pure functions that decide what to show as a star's
// display name during constellation authoring.
//
// Extracted out of AuthoringPanel.vue (review finding #3) so this logic is
// testable in isolation and the component doesn't have to carry it. No
// engine or DOM dependency at all, including the RA/Dec fallback: c2s/anp/
// anpm are reimplemented here from
// vendor/stellarium-web-engine/src/js/pre.js (they are themselves pure
// math with no WASM/engine-state dependency — verified by reading that
// file), so formatRaDecLabel() takes a plain [x, y, z] radec vector and
// needs no `stel` instance.
//
// Priority order for a star's displayed name (see the Task 6 course
// correction this implements): (1) this culture's native name, (2) a
// proper name or Bayer designation, (3) a neutral fallback derived from
// the star's actual sky position — NEVER a raw catalog id (HIP number or
// otherwise) as the primary label.
//
// Denylist-by-default (review finding #3): the previous version of this
// logic used an ALLOWLIST of known catalog prefixes (HIP/GAIA/TYC/2MASS/
// SAO/WDS/HD) and treated anything that didn't match as a displayable
// proper name. That is backwards — a designation the engine's data adds
// later with an unlisted prefix (BD, PPM, AC, CSI, ...) would silently
// render as if it were the star's name. looksLikeCatalogDesignation()
// below instead requires a designation to POSITIVELY look like a human
// name (no digits, no recognized catalog-style prefix) before it is ever
// shown; anything catalog-shaped is rejected by default, known prefixes or
// not.

const BAYER_GREEK = {
  alf: 'α', bet: 'β', gam: 'γ', del: 'δ', eps: 'ε', zet: 'ζ', eta: 'η',
  the: 'θ', iot: 'ι', kap: 'κ', lam: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  omi: 'ο', pi: 'π', rho: 'ρ', sig: 'σ', tau: 'τ', ups: 'υ', phi: 'φ',
  chi: 'χ', psi: 'ψ', ome: 'ω',
};

const NAME_PREFIX = /^NAME\s+(.+)$/;
const BAYER_PREFIX = /^\*\s+(\S+)\s+(.+)$/;

// Prefixes the engine's data is already known to use for catalog
// designations. Kept only as a fast-path / documentation aid — the digit
// checks below are what actually make this a denylist (they catch
// anything catalog-shaped, listed here or not), not this list.
const KNOWN_CATALOG_PREFIX_HINTS =
  /^(HIP|GAIA|TYC|2MASS|SAO|WDS|HD|BD|PPM|AC|CSI|NGC|IC|PSR|USNO|UCAC)\b/i;

/**
 * True if `token` looks like a catalog-style designation (and therefore
 * must never be shown as a star's display name), false only if it
 * positively looks like a human-readable proper name.
 *
 * Denylist posture: default is "not displayable" unless the token is
 * plain letters/spaces/punctuation with no digits and no recognized
 * catalog-prefix shape. Genuine traditional star proper names ("Arcturus",
 * "Sirius", "Rigel") don't contain digits; essentially every catalog
 * designation does (HIP 91262, TYC 1234-567-1, BD+36 3317, 2MASS
 * J18365633+3854549, GAIA DR3 ...), so "contains a digit" alone already
 * catches the vast majority, including prefixes no allowlist would have
 * listed. The prefix-hint check catches the rare digit-free catalog style.
 *
 * @param {*} token
 * @returns {boolean}
 */
export function looksLikeCatalogDesignation(token) {
  if (typeof token !== 'string') return true;
  const s = token.trim();
  if (s === '') return true;
  if (KNOWN_CATALOG_PREFIX_HINTS.test(s)) return true;
  if (/[A-Za-z]\d/.test(s)) return true; // letters directly followed by digits (BD+36, TYC1234, ...)
  if (/\d[A-Za-z]/.test(s)) return true; // digits directly followed by letters (2MASS, 3C, ...)
  if (/\d/.test(s)) return true; // any digit at all — catalog-style by default
  return false;
}

/**
 * Pick a proper name or Bayer designation out of an engine `designations()`
 * array, or null if nothing displayable is present. Never returns a
 * catalog-style token (see looksLikeCatalogDesignation).
 *
 * @param {string[]} designations
 * @returns {string|null}
 */
export function extractProperOrBayer(designations) {
  if (!Array.isArray(designations)) return null;

  // Single left-to-right pass over the array, in the order the engine
  // returns designations (which puts the proper name first when one
  // exists — e.g. Arcturus's real observed shape is
  // ["Arcturus", "* alf Boo", "* 16 Boo", "HIP 69673"]). Whichever
  // designation is the first to match one of the three displayable shapes
  // wins, rather than checking "any NAME-prefixed entry, else any
  // Bayer-prefixed entry, else any bare entry" across separate passes —
  // that per-pattern-then-array ordering would prefer a later Bayer
  // designation over an earlier bare proper name for exactly this
  // observed Arcturus shape, which is backwards.
  for (const d of designations) {
    if (typeof d !== 'string') continue;

    // An engine "NAME <x>" record is an explicit, authoritative "this is
    // an approved proper name" marker (IAU-style), so it is trusted as-is
    // without running it through the catalog-shape denylist.
    const nameMatch = NAME_PREFIX.exec(d);
    if (nameMatch && nameMatch[1].trim() !== '') return nameMatch[1];

    const bayerMatch = BAYER_PREFIX.exec(d);
    if (bayerMatch) {
      const abbrev = bayerMatch[1].replace(/\.$/, '').toLowerCase();
      const greek = BAYER_GREEK[abbrev];
      return greek ? `${greek} ${bayerMatch[2]}` : `${bayerMatch[1]} ${bayerMatch[2]}`;
    }

    if (!d.startsWith('* ') && !looksLikeCatalogDesignation(d)) return d;
  }

  return null;
}

// --- Pure reimplementation of the engine's c2s/anp/anpm, for the RA/Dec
// fallback label only. Source: vendor/stellarium-web-engine/src/js/pre.js
// — these are plain math with no WASM/engine-state dependency, so
// reproducing them here keeps the whole fallback path pure and testable
// without a `stel` mock.
function c2s(v) {
  const x = v[0];
  const y = v[1];
  const z = v[2];
  const d2 = x * x + y * y;
  const theta = d2 === 0 ? 0 : Math.atan2(y, x);
  const phi = z === 0 ? 0 : Math.atan2(z, Math.sqrt(d2));
  return [theta, phi];
}

function anp(a) {
  let v = a % (2 * Math.PI);
  if (v < 0) v += 2 * Math.PI;
  return v;
}

function anpm(a) {
  let v = a % (2 * Math.PI);
  if (Math.abs(v) >= Math.PI) v -= 2 * Math.PI * Math.sign(a);
  return v;
}

/**
 * A neutral fallback label derived from a star's actual sky position —
 * never a fabricated or catalog-id-derived name.
 *
 * @param {[number, number, number]|null} radec - ICRF cartesian direction
 *   vector, as returned by the engine's `obj.getInfo('radec', observer)`.
 * @returns {string}
 */
export function formatRaDecLabel(radec) {
  if (!Array.isArray(radec) || radec.length < 3) return 'Selected star';
  try {
    const [ra, dec] = c2s(radec);
    const raHours = anp(ra) * (12 / Math.PI);
    const decDeg = anpm(dec) * (180 / Math.PI);
    const h = Math.floor(raHours);
    const m = Math.floor((raHours - h) * 60);
    const sign = decDeg < 0 ? '−' : '+';
    const d = Math.floor(Math.abs(decDeg));
    return `Star near RA ${h}h${String(m).padStart(2, '0')}m, Dec ${sign}${d}°`;
  } catch {
    return 'Selected star';
  }
}

/**
 * Resolve the full display record for one selected star: `{ primary, sub }`.
 * `primary` is never a raw catalog id (HIP or otherwise) and never a
 * fabricated name. `sub` (a pronunciation hint) is only ever present
 * alongside a culture's native name, straight from the engine payload.
 *
 * @param {{designations?: string[], culturalNames?: Array<{name_native?: string, name_pronounce?: string}>, radec?: [number, number, number]|null}} info
 * @returns {{primary: string, sub: string|null}}
 */
export function resolveStarDisplayName(info) {
  const { designations, culturalNames, radec } = info || {};

  const cultural =
    Array.isArray(culturalNames) && culturalNames.length > 0 ? culturalNames[0] : null;
  if (cultural && cultural.name_native) {
    return { primary: cultural.name_native, sub: cultural.name_pronounce || null };
  }

  const properOrBayer = extractProperOrBayer(designations);
  if (properOrBayer) return { primary: properOrBayer, sub: null };

  return { primary: formatRaDecLabel(radec), sub: null };
}
