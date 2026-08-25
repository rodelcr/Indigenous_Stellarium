// objectInfo.js — pure formatting for the "what did I just click" panel.
//
// Everything here is unit conversion and presentation, which is exactly the
// kind of code that is wrong in ways a browser check does not reveal: a
// distance rendered in the wrong unit still looks like a distance. Hence
// pure functions and tests rather than inline template expressions.
//
// Engine facts these rest on, verified in vendor/ source:
//   obj.getInfo('vmag')      apparent magnitude
//   obj.getInfo('distance')  AU (stars.c:36, "Distance in AU")
//   obj.getInfo('radius')    angular radius, radians
//   obj.getInfo('phase')     illuminated fraction, 0..1
//   obj.type                 1-4 char otype code
//   stel.otypeToStr(code)    human string for that code

/** 1 light-year in astronomical units. */
export const AU_PER_LY = 63241.077;
/** 1 parsec in astronomical units. */
export const AU_PER_PC = 206264.806;

/**
 * Magnitude, or null when the engine has none. Kept to one decimal: the
 * bundled catalogue's precision does not justify more, and a value like
 * "4.83000001" reads as false precision.
 */
export function formatMagnitude(vmag) {
  if (vmag === null || vmag === undefined || !Number.isFinite(vmag)) return null;
  return vmag.toFixed(1);
}

/**
 * Distance, chosen unit by scale, or null when unknown.
 *
 * Solar-system objects come back as a few AU; stars as hundreds of
 * thousands. Rendering a star's distance in AU is technically correct and
 * useless, so this switches to light-years past a threshold. NaN is a real
 * and common value here — the engine sets distance to NAN for stars with no
 * parallax (stars.c:128) — and must read as "not known", never as 0.
 */
export function formatDistance(au) {
  if (au === null || au === undefined || !Number.isFinite(au)) return null;
  if (au <= 0) return null;
  if (au < 0.01) {
    // Closer than the Moon is to Earth: kilometres are the readable unit.
    const km = au * 149597870.7;
    return `${Math.round(km).toLocaleString('en-US')} km`;
  }
  if (au < 1000) {
    return `${au.toFixed(au < 10 ? 3 : 1)} AU`;
  }
  const ly = au / AU_PER_LY;
  if (ly < 10) return `${ly.toFixed(2)} light-years`;
  if (ly < 10000) return `${Math.round(ly).toLocaleString('en-US')} light-years`;
  return `${(ly / 1000).toFixed(1)} thousand light-years`;
}

/** Angular size from the engine's angular RADIUS (radians), as a diameter,
 *  which is how catalogues and people describe objects. */
export function formatAngularSize(radiusRad) {
  if (!Number.isFinite(radiusRad) || radiusRad <= 0) return null;
  const deg = radiusRad * (180 / Math.PI) * 2;
  if (deg >= 1) return `${deg.toFixed(2)}°`;
  const arcmin = deg * 60;
  if (arcmin >= 1) return `${arcmin.toFixed(1)}′`;
  return `${(arcmin * 60).toFixed(1)}″`;
}

/** Illuminated fraction as a percentage (Moon, planets). */
export function formatPhase(phase) {
  if (!Number.isFinite(phase) || phase < 0 || phase > 1) return null;
  return `${Math.round(phase * 100)}% lit`;
}

/**
 * Split designations into catalogue identifiers and everything else.
 *
 * Catalogue numbers are storage, not interface — a project rule. They are
 * still shown, but last and quietly, never as the object's name.
 */
const CATALOGUE_RE = /^(HIP|HD|HR|SAO|TYC|GAIA|NGC|IC|M|Cl|LEDA|PGC|UGC|MCG|2MASS|BD|CD|CPD|GJ|WDS)\b/i;

export function isCatalogueDesignation(d) {
  return CATALOGUE_RE.test(String(d).trim());
}

/**
 * Choose what to call the object.
 *
 * Order: a name in the active sky culture, then a proper name, then a
 * catalogue designation as a last resort. A viewer looking at a Māori sky
 * should see the Māori name for the star, not "HIP 17702" and not
 * "Pleiades".
 *
 * Returns { primary, secondary, pronounce } with secondary/pronounce null
 * when there is nothing real to put there — never a placeholder.
 */
export function chooseNames(designations, culturalNames) {
  const cultural = Array.isArray(culturalNames) ? culturalNames : [];
  const first = cultural.find((c) => c && (c.name_native || c.name_english));
  const ds = Array.isArray(designations) ? designations.map(String) : [];
  const proper = ds.find((d) => !isCatalogueDesignation(d) && !/^\*/.test(d));

  if (first) {
    const native = first.name_native || null;
    const english = first.name_english || null;
    return {
      primary: native || english,
      secondary: native && english && native !== english ? english : proper || null,
      pronounce: first.name_pronounce || null,
    };
  }
  if (proper) return { primary: proper, secondary: null, pronounce: null };
  return { primary: ds[0] || null, secondary: null, pronounce: null };
}

/** Catalogue designations, in the order the engine gave them. */
export function catalogueDesignations(designations) {
  if (!Array.isArray(designations)) return [];
  return designations.map(String).filter(isCatalogueDesignation);
}

/**
 * Pick the most informative otype from the engine's list.
 *
 * The engine does NOT expose a single `obj.type` for catalogue objects —
 * that property is undefined. The codes live in `obj.jsonData.types`, an
 * array, and it is generic-to-specific with a '?' sentinel: Sirius comes
 * back as ["*", "?"], i.e. "Star" and "Object of unknown nature". Reading
 * obj.type instead showed no type at all on every object, which is the bug
 * a browser check found and the unit tests could not.
 *
 * '?' is dropped, and the longest remaining code wins because SIMBAD's
 * scheme nests by extension: '*' star, '**' double, 'SB*' spectroscopic
 * binary.
 */
export function pickOtype(types) {
  const list = Array.isArray(types) ? types : types ? [types] : [];
  const useful = list
    .map((c) => String(c).trim())
    .filter((c) => c && c !== '?');
  if (!useful.length) return null;
  return useful.reduce((best, c) => (c.length > best.length ? c : best), useful[0]);
}

/**
 * Readable object type. `otypeToStr` is the engine's own lookup; when it
 * returns nothing useful the raw code is better than inventing a category.
 */
export function formatType(rawType, otypeToStr) {
  const code = pickOtype(rawType);
  if (!code) return null;
  let label = null;
  try {
    label = otypeToStr ? otypeToStr(code) : null;
  } catch (err) {
    label = null;
  }
  if (!label || label === code || /unknown nature/i.test(label)) return code;
  return label;
}
