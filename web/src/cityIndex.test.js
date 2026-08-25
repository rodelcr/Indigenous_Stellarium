import { describe, it, expect } from 'vitest'
import {
  searchPlaces, formatPlace, parseCoordinate, validateLatLon,
  formatLatLon, degToRad, radToDeg, normalize,
} from './cityIndex.js'

// [name, country, lat, lon, population]
const PLACES = [
  ['Cusco', 'Peru', -13.5183, -71.978, 312140],
  // Synthetic rows, purely to exercise the exact > prefix > substring
  // ordering; real coverage is asserted against the real file elsewhere.
  ['Cuscovia', 'Testland', 0, 0, 900000],
  ['Old Cusco', 'Testland', 0, 0, 800000],
  ['Hanga Roa', 'Chile', -27.1533, -109.4339, 7750],
  ['Springfield', 'United States', 39.8017, -89.6437, 116565],
  ['Springfield', 'United States', 42.1015, -72.5898, 154758],
  ['Temuco', 'Chile', -38.7359, -72.5904, 260878],
]

describe('normalize', () => {
  it('folds case and diacritics so accented names are findable', () => {
    expect(normalize('Cuscó')).toBe('cusco')
    expect(normalize('  ÑUÑOA ')).toBe('nunoa')
  })
})

describe('searchPlaces', () => {
  it('ranks exact, then prefix, then substring — regardless of population', () => {
    // Cuscovia and Old Cusco are both far larger; an exact match still wins,
    // otherwise typing a place's full name would not find it.
    const r = searchPlaces(PLACES, 'cusco')
    expect(r.map((x) => x.name)).toEqual(['Cusco', 'Cuscovia', 'Old Cusco'])
  })

  it('finds a small place that a major-cities list would omit', () => {
    // The whole reason the dataset threshold is 5,000 and not 15,000.
    const r = searchPlaces(PLACES, 'hanga')
    expect(r[0].name).toBe('Hanga Roa')
    expect(r[0].country).toBe('Chile')
  })

  it('breaks ties by population, so a duplicate name is not arbitrary', () => {
    const r = searchPlaces(PLACES, 'springfield')
    expect(r[0].population).toBe(154758)
  })

  it('ignores case and accents in the query', () => {
    expect(searchPlaces(PLACES, 'TEMUCO')[0].name).toBe('Temuco')
    expect(searchPlaces(PLACES, 'cuscó')[0].name).toBe('Cusco')
  })

  it('returns nothing for an empty or whitespace query rather than everything', () => {
    expect(searchPlaces(PLACES, '')).toEqual([])
    expect(searchPlaces(PLACES, '   ')).toEqual([])
  })

  it('respects the limit', () => {
    expect(searchPlaces(PLACES, 'a', 2).length).toBeLessThanOrEqual(2)
  })
})

describe('formatPlace', () => {
  it('reads as a place, not a record', () => {
    expect(formatPlace({ name: 'Hanga Roa', country: 'Chile' })).toBe('Hanga Roa, Chile')
  })
})

describe('parseCoordinate', () => {
  it('accepts plain decimals including negatives', () => {
    expect(parseCoordinate('-27.1533')).toBeCloseTo(-27.1533, 6)
    expect(parseCoordinate('42')).toBe(42)
  })

  it('accepts the hemisphere-suffixed form people copy off a phone', () => {
    expect(parseCoordinate('27.15 S')).toBeCloseTo(-27.15, 6)
    expect(parseCoordinate('109.4339W')).toBeCloseTo(-109.4339, 6)
    expect(parseCoordinate('13.5 N')).toBeCloseTo(13.5, 6)
  })

  it('does not negate twice when the sign and the hemisphere agree', () => {
    // "-27 S" is contradictory input; landing at +27 would put the observer
    // in the wrong hemisphere with a plausible-looking number.
    expect(parseCoordinate('-27 S')).toBeCloseTo(-27, 6)
  })

  it('tolerates a degree symbol', () => {
    expect(parseCoordinate('27.15° S')).toBeCloseTo(-27.15, 6)
  })

  it('returns null rather than NaN for junk, so NaN never reaches the engine', () => {
    for (const bad of ['', '   ', 'north', '12,5', '1.2.3', null, undefined, '12 Q']) {
      expect(parseCoordinate(bad)).toBeNull()
    }
  })
})

describe('validateLatLon', () => {
  it('accepts in-range values', () => {
    expect(validateLatLon(-27.15, -109.43)).toBeNull()
    expect(validateLatLon(90, 180)).toBeNull()
    expect(validateLatLon(-90, -180)).toBeNull()
  })

  it('rejects out-of-range values and says which', () => {
    expect(validateLatLon(91, 0)).toMatch(/Latitude/)
    expect(validateLatLon(0, 181)).toMatch(/Longitude/)
  })

  it('rejects nulls from a failed parse', () => {
    expect(validateLatLon(null, 0)).toMatch(/Latitude/)
    expect(validateLatLon(0, null)).toMatch(/Longitude/)
  })
})

describe('degrees and radians', () => {
  // The engine's observer.latitude/.longitude are TYPE_ANGLE in RADIANS.
  // Feeding it degrees puts the observer 57x off with no error.
  it('converts both ways', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 12)
    expect(degToRad(-27.1533)).toBeCloseTo(-0.4739144878, 9)
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 12)
  })

  it('round-trips', () => {
    for (const d of [-90, -27.1533, 0, 51.5, 90, 180]) {
      expect(radToDeg(degToRad(d))).toBeCloseTo(d, 10)
    }
  })
})

describe('formatLatLon', () => {
  it('uses hemisphere letters so the sign does not have to be decoded', () => {
    expect(formatLatLon(-27.1533, -109.4339)).toBe('27.1533° S, 109.4339° W')
    expect(formatLatLon(21.3, 157.8)).toBe('21.3000° N, 157.8000° E')
  })
})
