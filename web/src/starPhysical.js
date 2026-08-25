// starPhysical.js — the pedagogical layer: colour, temperature, class,
// multiplicity.
//
// EVERY value here is either read from the catalogue or derived by a named,
// published relation. Nothing is asserted from plausibility. That matters
// more than usual for this file, because "surface temperature: 5,778 K"
// reads as a measured fact whatever its provenance, and a planetarium that
// quietly makes them up teaches wrong things confidently.
//
// What the engine actually carries, verified in vendor/ source:
//   obj.jsonData.model_data.BVMag    B-V colour index      (stars.c:237)
//   obj.jsonData.model_data.spect_t  spectral type string  (stars.c:240)
//   obj.jsonData.model_data.plx      parallax, mas         (stars.c:234)
//   obj.jsonData.model_data.morpho   morphological type    (dso.c:146)
//   obj.jsonData.model_data.dimx/dimy  major/minor axis, arcmin (dso.c:135)
//   obj.type                         SIMBAD otype code; the engine's table
//                                    has 290 of them (otypes.c)
//
// Anything the catalogue does not carry is OMITTED. A star with no B-V gets
// no colour and no temperature, not a guess from its spectral class.

/**
 * Effective temperature estimated from the B-V colour index.
 *
 * Relation: Ballesteros, F. J., "New insights into black bodies",
 * EPL (Europhysics Letters) 97, 34008 (2012),
 * doi:10.1209/0295-5075/97/34008 — verified against CrossRef, not quoted
 * from memory.
 *
 *   T = 4600 K * ( 1/(0.92*BV + 1.70) + 1/(0.92*BV + 0.62) )
 *
 * It is a fit for main-sequence-ish stars and it is an ESTIMATE. Callers
 * must present it as one. It also assumes B-V is unreddened: for a heavily
 * reddened star the answer is too cool, and this code has no extinction
 * information with which to correct it.
 *
 * Returns null outside the range where the fit is meaningful rather than
 * extrapolating into nonsense.
 */
export const BV_TEMPERATURE_SOURCE =
  'Estimated from the B−V colour index using Ballesteros (2012), EPL 97 34008.';

export const BV_MIN = -0.4;
export const BV_MAX = 2.0;

export function temperatureFromBV(bv) {
  if (bv === null || bv === undefined || !Number.isFinite(bv)) return null;
  if (bv < BV_MIN || bv > BV_MAX) return null;
  const t =
    4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  return Number.isFinite(t) && t > 0 ? t : null;
}

/** Rounded to 4 significant-ish figures, because the input is a colour index
 *  and the relation is a fit — "5778 K" would be false precision. */
export function formatTemperature(kelvin) {
  if (!Number.isFinite(kelvin) || kelvin <= 0) return null;
  const step = kelvin >= 10000 ? 500 : 100;
  return `${(Math.round(kelvin / step) * step).toLocaleString('en-US')} K`;
}

/**
 * Descriptive colour and a swatch, from B-V.
 *
 * This is a PRESENTATION of the measured colour index, not a photograph and
 * not a claim about what the eye would see (the eye sees almost all stars as
 * white at naked-eye brightness). Bands follow the conventional B-V ranges
 * for the spectral classes.
 */
const COLOUR_BANDS = [
  { max: -0.20, name: 'blue', swatch: '#9bb0ff' },
  { max: 0.00, name: 'blue-white', swatch: '#aabfff' },
  { max: 0.30, name: 'white', swatch: '#cad7ff' },
  { max: 0.58, name: 'yellow-white', swatch: '#f8f7ff' },
  { max: 0.81, name: 'yellow', swatch: '#fff4ea' },
  { max: 1.40, name: 'orange', swatch: '#ffd2a1' },
  { max: Infinity, name: 'red', swatch: '#ffcc6f' },
];

export function colourFromBV(bv) {
  if (bv === null || bv === undefined || !Number.isFinite(bv)) return null;
  const band = COLOUR_BANDS.find((b) => bv < b.max) || COLOUR_BANDS[COLOUR_BANDS.length - 1];
  return { name: band.name, swatch: band.swatch };
}

/**
 * Pull the Morgan-Keenan class out of a spectral type string.
 *
 * Real strings are messy: "G2V", "K0III", "B8/9V", "M2Iab:", "F5". This
 * takes the leading class letter and, when present, the numeric subclass
 * and a roman-numeral luminosity class. Returns null when the string does
 * not start with a recognised class rather than guessing.
 */
const CLASS_DESCRIPTIONS = {
  O: 'very hot and blue, and rare',
  B: 'hot and blue-white',
  A: 'white',
  F: 'yellow-white',
  G: 'yellow, like the Sun',
  K: 'cooler and orange',
  M: 'cool and red, the most common kind',
};

const LUMINOSITY_DESCRIPTIONS = {
  I: 'supergiant',
  II: 'bright giant',
  III: 'giant',
  IV: 'subgiant',
  V: 'main sequence (dwarf)',
  VI: 'subdwarf',
};

export function parseSpectralType(sp) {
  if (typeof sp !== 'string') return null;
  const s = sp.trim();
  const m = /^([OBAFGKM])\s*(\d(?:\.\d)?)?\s*(I{1,3}V?|IV|V?I{0,3})?/.exec(s.toUpperCase());
  if (!m) return null;
  const cls = m[1];
  const sub = m[2] !== undefined ? m[2] : null;
  // Only accept a luminosity class we actually have a description for; the
  // regex will happily match an empty string or a fragment.
  const lumRaw = (m[3] || '').trim();
  const lum = LUMINOSITY_DESCRIPTIONS[lumRaw] ? lumRaw : null;
  return {
    raw: s,
    class: cls,
    subclass: sub,
    luminosity: lum,
    classDescription: CLASS_DESCRIPTIONS[cls] || null,
    luminosityDescription: lum ? LUMINOSITY_DESCRIPTIONS[lum] : null,
  };
}

/**
 * Is this object a single star, or a double/multiple system?
 *
 * Read from the SIMBAD otype the catalogue assigns, never inferred from a
 * name. Returns null for objects where the catalogue says nothing — which
 * is most of them, and "unknown" is the honest answer rather than "single".
 */
const MULTIPLE_OTYPES = {
  '**': 'Double or multiple star',
  'EB*': 'Eclipsing binary',
  'Al*': 'Eclipsing binary (Algol type)',
  'bL*': 'Eclipsing binary (beta Lyrae type)',
  'WU*': 'Eclipsing binary (W UMa type)',
  'SB*': 'Spectroscopic binary',
  'CV*': 'Cataclysmic binary',
  'XB*': 'X-ray binary',
  'LXB': 'Low-mass X-ray binary',
  'HXB': 'High-mass X-ray binary',
};

export function describeMultiplicity(otype) {
  const code = (otype || '').trim();
  if (!code) return null;
  if (MULTIPLE_OTYPES[code]) return { multiple: true, label: MULTIPLE_OTYPES[code] };
  // A trailing '?' marks a candidate in SIMBAD's scheme; report the doubt.
  if (code.endsWith('?') && MULTIPLE_OTYPES[code.slice(0, -1)]) {
    return { multiple: true, label: `Possible ${MULTIPLE_OTYPES[code.slice(0, -1)].toLowerCase()}` };
  }
  return null;
}

/** Star fields out of obj.jsonData, defensively. */
export function readStarModelData(jsonData) {
  const md = jsonData && jsonData.model_data ? jsonData.model_data : null;
  if (!md) return {};
  const num = (v) => (Number.isFinite(v) ? v : null);
  return {
    bv: num(md.BVMag),
    spectralType: typeof md.spect_t === 'string' && md.spect_t.trim() ? md.spect_t.trim() : null,
    parallaxMas: num(md.plx),
    morphology: typeof md.morpho === 'string' && md.morpho.trim() ? md.morpho.trim() : null,
    dimX: num(md.dimx),
    dimY: num(md.dimy),
  };
}

/** Major x minor axis in arcminutes, as catalogues quote galaxy sizes. */
export function formatDsoDimensions(dimX, dimY) {
  if (!Number.isFinite(dimX) || dimX <= 0) return null;
  const fmt = (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));
  if (!Number.isFinite(dimY) || dimY <= 0 || Math.abs(dimY - dimX) < 0.05) {
    return `${fmt(dimX)}′`;
  }
  return `${fmt(dimX)}′ × ${fmt(dimY)}′`;
}
