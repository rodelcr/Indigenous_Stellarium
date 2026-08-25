import { describe, it, expect } from 'vitest'
import {
  formatMagnitude, formatDistance, formatAngularSize, formatPhase,
  chooseNames, catalogueDesignations, isCatalogueDesignation, formatType,
  pickOtype, AU_PER_LY,
} from './objectInfo.js'

describe('formatMagnitude', () => {
  it('rounds to one decimal', () => {
    expect(formatMagnitude(4.8300001)).toBe('4.8')
    expect(formatMagnitude(-1.46)).toBe('-1.5')
  })

  it('returns null for absent or non-finite values rather than "NaN"', () => {
    for (const v of [null, undefined, NaN, Infinity]) expect(formatMagnitude(v)).toBeNull()
  })
})

describe('formatDistance', () => {
  // The engine reports distance in AU for everything (stars.c:36). Showing a
  // star's distance in AU is correct and useless; showing a planet's in
  // light-years is worse.
  it('uses AU for solar-system scales', () => {
    expect(formatDistance(1)).toBe('1.000 AU')
    expect(formatDistance(30.1)).toBe('30.1 AU')
  })

  it('uses kilometres for things nearer than the Moon', () => {
    expect(formatDistance(0.00257)).toMatch(/km$/)
  })

  it('switches to light-years for stellar scales', () => {
    expect(formatDistance(AU_PER_LY * 4.37)).toBe('4.37 light-years')
    expect(formatDistance(AU_PER_LY * 444)).toBe('444 light-years')
  })

  it('uses thousands of light-years for the far ones', () => {
    expect(formatDistance(AU_PER_LY * 25000)).toBe('25.0 thousand light-years')
  })

  // The engine sets distance to NAN for stars with no parallax
  // (stars.c:128). That must read as unknown, never as zero.
  it('treats NaN and zero as unknown, not as a distance', () => {
    expect(formatDistance(NaN)).toBeNull()
    expect(formatDistance(0)).toBeNull()
    expect(formatDistance(-5)).toBeNull()
  })
})

describe('formatAngularSize', () => {
  it('reports a diameter, not the engine radius', () => {
    // 1° radius is a 2° object.
    expect(formatAngularSize((1 * Math.PI) / 180)).toBe('2.00°')
  })

  it('uses arcminutes below one degree — the Moon reads as 30 arcmin', () => {
    const moonRadius = (0.25 * Math.PI) / 180
    expect(formatAngularSize(moonRadius)).toBe('30.0′')
  })

  it('uses arcseconds below one arcminute', () => {
    expect(formatAngularSize((0.005 * Math.PI) / 180)).toBe('36.0″')
  })

  it('returns null for missing values', () => {
    expect(formatAngularSize(NaN)).toBeNull()
    expect(formatAngularSize(0)).toBeNull()
  })
})

describe('formatPhase', () => {
  it('reads as a percentage lit', () => {
    expect(formatPhase(0.5)).toBe('50% lit')
    expect(formatPhase(1)).toBe('100% lit')
  })

  it('rejects out-of-range and missing values', () => {
    expect(formatPhase(1.4)).toBeNull()
    expect(formatPhase(NaN)).toBeNull()
  })
})

describe('catalogue designations', () => {
  it('recognises the common catalogues', () => {
    for (const d of ['HIP 17702', 'HD 23630', 'NGC 224', 'M 45', 'TYC 1234-5-1', 'GAIA 123']) {
      expect(isCatalogueDesignation(d), d).toBe(true)
    }
  })

  it('does not treat a proper name as a catalogue id', () => {
    for (const d of ['Arcturus', 'Matariki', 'Sirius']) {
      expect(isCatalogueDesignation(d), d).toBe(false)
    }
  })

  it('filters a designation list', () => {
    expect(catalogueDesignations(['Arcturus', '* alf Boo', 'HIP 69673']))
      .toEqual(['HIP 69673'])
  })
})

describe('chooseNames', () => {
  // The project rule: catalogue numbers are storage, never interface, and a
  // culture's own name outranks the Western proper name.
  it('prefers the active culture name over a proper name', () => {
    const r = chooseNames(['Pleiades', 'HIP 17702'], [{ name_native: 'Matariki', name_english: 'Pleiades' }])
    expect(r.primary).toBe('Matariki')
    expect(r.secondary).toBe('Pleiades')
  })

  it('carries pronunciation when the culture supplies it', () => {
    const r = chooseNames(['HIP 1'], [{ name_native: 'Yacana', name_pronounce: 'ya-KA-na' }])
    expect(r.pronounce).toBe('ya-KA-na')
  })

  it('does not repeat the same string as both names', () => {
    const r = chooseNames(['X'], [{ name_native: 'Same', name_english: 'Same' }])
    expect(r.secondary).not.toBe('Same')
  })

  it('falls back to a proper name when no culture name exists', () => {
    expect(chooseNames(['Arcturus', 'HIP 69673'], []).primary).toBe('Arcturus')
  })

  it('uses a catalogue id only as a last resort', () => {
    expect(chooseNames(['HIP 69673'], []).primary).toBe('HIP 69673')
  })

  it('never invents a secondary name or pronunciation', () => {
    const r = chooseNames(['Arcturus'], [])
    expect(r.secondary).toBeNull()
    expect(r.pronounce).toBeNull()
  })

  it('survives missing or malformed input', () => {
    expect(chooseNames(undefined, undefined).primary).toBeNull()
    expect(chooseNames([], [null]).primary).toBeNull()
  })
})

describe('formatType', () => {
  it('uses the engine lookup when it gives something better than the code', () => {
    expect(formatType('G', () => 'Galaxy')).toBe('Galaxy')
  })

  it('falls back to the raw code rather than inventing a category', () => {
    expect(formatType('Zz', () => '')).toBe('Zz')
    expect(formatType('Zz', () => 'Zz')).toBe('Zz')
    expect(formatType('Zz', null)).toBe('Zz')
  })

  it('survives a throwing lookup', () => {
    expect(formatType('G', () => { throw new Error('boom') })).toBe('G')
  })

  it('returns null when there is no type at all', () => {
    expect(formatType('', () => 'x')).toBeNull()
    expect(formatType(null, () => 'x')).toBeNull()
  })
})

describe('pickOtype — the shape the engine actually returns', () => {
  // Found by a browser check, not by these tests: obj.type is undefined and
  // the codes live in obj.jsonData.types as an array with a '?' sentinel.
  // Sirius really does come back as ["*", "?"].
  it('drops the unknown-nature sentinel', () => {
    expect(pickOtype(['*', '?'])).toBe('*')
  })

  it('prefers the more specific code, which is the longer one', () => {
    expect(pickOtype(['*', '**', '?'])).toBe('**')
    expect(pickOtype(['*', '**', 'SB*'])).toBe('SB*')
  })

  it('accepts a bare string as well as an array', () => {
    expect(pickOtype('G')).toBe('G')
  })

  it('returns null for nothing usable', () => {
    for (const v of [null, undefined, [], ['?'], ['', '  ']]) expect(pickOtype(v)).toBeNull()
  })
})

describe('formatType with real engine input', () => {
  it('reads a type out of the array form', () => {
    expect(formatType(['*', '?'], (c) => (c === '*' ? 'Star' : 'Object of unknown nature')))
      .toBe('Star')
  })

  // "Object of unknown nature" is worse than showing the raw code: it reads
  // as a claim about the object rather than about the catalogue.
  it('does not surface the unknown-nature label', () => {
    expect(formatType(['Zz'], () => 'Object of unknown nature')).toBe('Zz')
  })

  it('returns null when the engine gives nothing', () => {
    expect(formatType(undefined, () => 'Star')).toBeNull()
  })
})
