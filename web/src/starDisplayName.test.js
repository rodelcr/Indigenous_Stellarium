import { describe, it, expect } from 'vitest';
import {
  looksLikeCatalogDesignation,
  extractProperOrBayer,
  formatRaDecLabel,
  resolveStarDisplayName,
} from './starDisplayName.js';

// A unit vector pointing at RA=0h, Dec=0deg, used as a stand-in "radec"
// engine vector wherever the exact position doesn't matter for the test.
const RADEC_ORIGIN = [1, 0, 0];

describe('looksLikeCatalogDesignation — denylist posture', () => {
  it('rejects known-prefix catalog ids', () => {
    expect(looksLikeCatalogDesignation('HIP 91262')).toBe(true);
    expect(looksLikeCatalogDesignation('GAIA DR3 123456789')).toBe(true);
  });

  it('rejects catalog-style tokens with prefixes outside any hardcoded allowlist', () => {
    // The whole point of finding #3: BD/PPM/AC/CSI were never in the old
    // allowlist and would have slipped through as "names".
    expect(looksLikeCatalogDesignation('BD+36 3317')).toBe(true);
    expect(looksLikeCatalogDesignation('PPM 12345')).toBe(true);
    expect(looksLikeCatalogDesignation('AC+12 3456')).toBe(true);
    expect(looksLikeCatalogDesignation('CSI+12 3456 1')).toBe(true);
  });

  it('rejects a digit-then-letters survey-style token', () => {
    expect(looksLikeCatalogDesignation('2MASS J18365633+3854549')).toBe(true);
  });

  it('accepts plain proper names', () => {
    expect(looksLikeCatalogDesignation('Arcturus')).toBe(false);
    expect(looksLikeCatalogDesignation('Sirius')).toBe(false);
  });

  it('rejects non-string and empty input', () => {
    expect(looksLikeCatalogDesignation(null)).toBe(true);
    expect(looksLikeCatalogDesignation(undefined)).toBe(true);
    expect(looksLikeCatalogDesignation('')).toBe(true);
    expect(looksLikeCatalogDesignation('   ')).toBe(true);
  });
});

describe('extractProperOrBayer', () => {
  it('prefers an explicit NAME record', () => {
    expect(extractProperOrBayer(['NAME Vega', '* alf Lyr', 'HIP 91262'])).toBe('Vega');
  });

  it('accepts a bare proper name with no NAME prefix (observed real engine shape)', () => {
    expect(extractProperOrBayer(['Arcturus', '* alf Boo', '* 16 Boo', 'HIP 69673'])).toBe(
      'Arcturus'
    );
  });

  it('falls back to a Bayer designation, converting the abbreviation to Greek', () => {
    expect(extractProperOrBayer(['* alf Boo', 'HIP 69673'])).toBe('α Boo');
  });

  it('falls back to the raw Bayer abbreviation when it is not in the Greek table', () => {
    expect(extractProperOrBayer(['* xyz Boo', 'HIP 69673'])).toBe('xyz Boo');
  });

  it('returns null for catalog-only designations, including an out-of-allowlist prefix', () => {
    expect(
      extractProperOrBayer(['HIP 12345', 'BD+36 3317', 'GAIA DR3 987654321'])
    ).toBeNull();
  });

  it('returns null for an empty designations array', () => {
    expect(extractProperOrBayer([])).toBeNull();
  });

  it('returns null for non-array input', () => {
    expect(extractProperOrBayer(null)).toBeNull();
    expect(extractProperOrBayer(undefined)).toBeNull();
  });
});

describe('formatRaDecLabel', () => {
  it('formats a known direction vector as an RA/Dec label, never a catalog id', () => {
    const label = formatRaDecLabel(RADEC_ORIGIN);
    expect(label).toMatch(/^Star near RA \d+h\d{2}m, Dec [+−]\d+°$/);
    expect(label).not.toMatch(/HIP|BD|GAIA|TYC/);
  });

  it('falls back to a neutral label for missing/invalid input', () => {
    expect(formatRaDecLabel(null)).toBe('Selected star');
    expect(formatRaDecLabel(undefined)).toBe('Selected star');
    expect(formatRaDecLabel([1, 2])).toBe('Selected star');
  });
});

describe('resolveStarDisplayName — priority order and end-to-end scenarios', () => {
  it('a star with a name in the active culture wins over everything else', () => {
    const result = resolveStarDisplayName({
      designations: ['NAME Vega', 'HIP 91262'],
      culturalNames: [{ name_native: 'Whetu Marama', name_pronounce: 'FEH-too mah-RAH-mah' }],
      radec: RADEC_ORIGIN,
    });
    expect(result).toEqual({ primary: 'Whetu Marama', sub: 'FEH-too mah-RAH-mah' });
  });

  it('a star with only a proper name (no cultural name, no pronunciation)', () => {
    const result = resolveStarDisplayName({
      designations: ['Arcturus', '* alf Boo', 'HIP 69673'],
      culturalNames: [],
      radec: RADEC_ORIGIN,
    });
    expect(result).toEqual({ primary: 'Arcturus', sub: null });
  });

  it('a star with only a Bayer designation', () => {
    const result = resolveStarDisplayName({
      designations: ['* bet Ori', 'HIP 24436'],
      culturalNames: null,
      radec: RADEC_ORIGIN,
    });
    expect(result).toEqual({ primary: 'β Ori', sub: null });
  });

  it('an unnamed star with catalog-only designations (including an out-of-allowlist prefix) falls back to the RA/Dec label, never the catalog id', () => {
    const result = resolveStarDisplayName({
      designations: ['HIP 12345', 'BD+36 3317'],
      culturalNames: [],
      radec: RADEC_ORIGIN,
    });
    expect(result.sub).toBeNull();
    expect(result.primary).toMatch(/^Star near RA/);
    expect(result.primary).not.toMatch(/HIP|BD/);
  });

  it('an empty designations array with no radec falls back to the neutral "Selected star" label', () => {
    const result = resolveStarDisplayName({
      designations: [],
      culturalNames: [],
      radec: null,
    });
    expect(result).toEqual({ primary: 'Selected star', sub: null });
  });
});
