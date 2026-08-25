import { describe, it, expect } from 'vitest'
import {
  temperatureFromBV, formatTemperature, colourFromBV, parseSpectralType,
  describeMultiplicity, readStarModelData, formatDsoDimensions,
  BV_MIN, BV_MAX,
} from './starPhysical.js'

describe('temperatureFromBV', () => {
  // Ballesteros (2012), EPL 97 34008. Checked against stars whose B-V and
  // effective temperature are both well known, to a tolerance that reflects
  // the fact this is a FIT and not a measurement.
  it('puts the Sun near 5800 K', () => {
    // Solar B-V = 0.65; accepted T_eff = 5772 K.
    const t = temperatureFromBV(0.65)
    expect(t).toBeGreaterThan(5500)
    expect(t).toBeLessThan(6100)
  })

  it('puts Vega (B-V 0.00, ~9600 K) in the right regime', () => {
    const t = temperatureFromBV(0.0)
    expect(t).toBeGreaterThan(8000)
    expect(t).toBeLessThan(11000)
  })

  it('puts Betelgeuse (B-V 1.85, ~3600 K) cool', () => {
    const t = temperatureFromBV(1.85)
    expect(t).toBeGreaterThan(3000)
    expect(t).toBeLessThan(4200)
  })

  it('is monotonically decreasing — redder is cooler', () => {
    let prev = Infinity
    for (let bv = BV_MIN; bv <= BV_MAX; bv += 0.1) {
      const t = temperatureFromBV(bv)
      expect(t).toBeLessThan(prev)
      prev = t
    }
  })

  // Extrapolating a fit past its range produces confident nonsense, which is
  // worse than saying nothing.
  it('refuses to extrapolate outside the fitted range', () => {
    expect(temperatureFromBV(BV_MIN - 0.01)).toBeNull()
    expect(temperatureFromBV(BV_MAX + 0.01)).toBeNull()
  })

  it('returns null for missing values instead of NaN', () => {
    for (const v of [null, undefined, NaN, 'x']) expect(temperatureFromBV(v)).toBeNull()
  })
})

describe('formatTemperature', () => {
  it('rounds to avoid false precision from a fitted relation', () => {
    expect(formatTemperature(5772)).toBe('5,800 K')
    expect(formatTemperature(9602)).toBe('9,600 K')
    // Coarser above 10,000 K, where the fit is least constrained.
    expect(formatTemperature(24300)).toBe('24,500 K')
  })

  it('returns null for nonsense', () => {
    expect(formatTemperature(NaN)).toBeNull()
    expect(formatTemperature(0)).toBeNull()
  })
})

describe('colourFromBV', () => {
  it('maps the conventional bands', () => {
    expect(colourFromBV(-0.3).name).toBe('blue')
    expect(colourFromBV(0.0).name).toBe('white')
    expect(colourFromBV(0.65).name).toBe('yellow')
    expect(colourFromBV(1.5).name).toBe('red')
  })

  it('always supplies a swatch with the name', () => {
    for (const bv of [-0.3, 0, 0.5, 1.0, 1.9]) {
      const c = colourFromBV(bv)
      expect(c.swatch).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('returns null without a colour index rather than defaulting to white', () => {
    expect(colourFromBV(null)).toBeNull()
    expect(colourFromBV(NaN)).toBeNull()
  })
})

describe('parseSpectralType', () => {
  it('reads class, subclass and luminosity from real catalogue strings', () => {
    const g2v = parseSpectralType('G2V')
    expect(g2v.class).toBe('G')
    expect(g2v.subclass).toBe('2')
    expect(g2v.luminosity).toBe('V')
    expect(g2v.luminosityDescription).toMatch(/main sequence/)
  })

  it('handles a giant', () => {
    const k0 = parseSpectralType('K0III')
    expect(k0.class).toBe('K')
    expect(k0.luminosityDescription).toBe('giant')
  })

  it('handles a class with no luminosity class', () => {
    const f5 = parseSpectralType('F5')
    expect(f5.class).toBe('F')
    expect(f5.luminosity).toBeNull()
    expect(f5.luminosityDescription).toBeNull()
  })

  it('keeps the raw string so nothing is lost in parsing', () => {
    expect(parseSpectralType('M2Iab:').raw).toBe('M2Iab:')
  })

  it('returns null for a string it does not recognise, rather than guessing', () => {
    for (const s of ['', 'WR', 'DA3', 'sdB', null, 42]) {
      expect(parseSpectralType(s)).toBeNull()
    }
  })
})

describe('describeMultiplicity', () => {
  // Read from the catalogue's otype, never inferred from a name.
  it('recognises a double or multiple star', () => {
    expect(describeMultiplicity('**').multiple).toBe(true)
    expect(describeMultiplicity('**').label).toMatch(/Double or multiple/)
  })

  it('recognises the binary subtypes', () => {
    expect(describeMultiplicity('SB*').label).toMatch(/Spectroscopic/)
    expect(describeMultiplicity('EB*').label).toMatch(/Eclipsing/)
  })

  it('reports SIMBAD candidate types as uncertain rather than as fact', () => {
    const r = describeMultiplicity('**?')
    expect(r.multiple).toBe(true)
    expect(r.label).toMatch(/^Possible/)
  })

  // Most stars carry no multiplicity otype. Saying "single" would be an
  // assertion the catalogue does not make.
  it('returns null for an ordinary star instead of claiming it is single', () => {
    expect(describeMultiplicity('*')).toBeNull()
    expect(describeMultiplicity('G')).toBeNull()
    expect(describeMultiplicity('')).toBeNull()
    expect(describeMultiplicity(null)).toBeNull()
  })
})

describe('readStarModelData', () => {
  it('pulls the real engine field names', () => {
    const r = readStarModelData({ model_data: { BVMag: 0.65, spect_t: 'G2V', plx: 742.1 } })
    expect(r.bv).toBe(0.65)
    expect(r.spectralType).toBe('G2V')
    expect(r.parallaxMas).toBe(742.1)
  })

  it('reads DSO fields from the same place', () => {
    const r = readStarModelData({ model_data: { morpho: 'SBb', dimx: 190, dimy: 60 } })
    expect(r.morphology).toBe('SBb')
    expect(r.dimX).toBe(190)
  })

  it('survives missing or malformed jsonData', () => {
    for (const j of [null, undefined, {}, { model_data: null }]) {
      expect(() => readStarModelData(j)).not.toThrow()
      expect(readStarModelData(j).bv ?? null).toBeNull()
    }
  })

  it('treats a blank spectral type as absent', () => {
    expect(readStarModelData({ model_data: { spect_t: '   ' } }).spectralType).toBeNull()
  })
})

describe('formatDsoDimensions', () => {
  it('quotes major x minor in arcminutes', () => {
    expect(formatDsoDimensions(190, 60)).toBe('190′ × 60′')
    expect(formatDsoDimensions(3.4, 1.2)).toBe('3.4′ × 1.2′')
  })

  it('collapses to one figure when the object is round', () => {
    expect(formatDsoDimensions(5, 5)).toBe('5.0′')
  })

  it('returns null without a size', () => {
    expect(formatDsoDimensions(null, null)).toBeNull()
    expect(formatDsoDimensions(0, 0)).toBeNull()
  })
})

describe('describeMultiplicity with the engine array form', () => {
  it('finds a binary code inside the array', () => {
    expect(describeMultiplicity(['*', '**', '?']).multiple).toBe(true)
    expect(describeMultiplicity(['*', 'SB*']).label).toMatch(/Spectroscopic/)
  })

  // The bundled demo catalogue types every star as plain '*' -- even Mizar,
  // which is a famous double. So this returns null a lot, and that is the
  // catalogue being silent rather than the star being single.
  it('returns null for the generic star type the demo catalogue uses', () => {
    expect(describeMultiplicity(['*', '?'])).toBeNull()
  })
})
