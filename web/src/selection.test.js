import { describe, it, expect } from 'vitest';
import { parseHip } from './selection.js';

describe('parseHip', () => {
  it('extracts the HIP number from a designations array', () => {
    expect(parseHip(['HIP 12345', 'GAIA 1234567890'])).toBe(12345);
  });

  it('returns null when there is no HIP designation', () => {
    expect(parseHip(['NAME Foo'])).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(parseHip([])).toBeNull();
  });

  it('finds the HIP designation even when it is not first', () => {
    expect(parseHip(['NAME Polaris', 'GAIA 1234567890', 'HIP 11767'])).toBe(11767);
  });

  it('does not match a token that merely contains the letters HIP', () => {
    expect(parseHip(['SHIP 12345', 'RELATIONSHIP 999'])).toBeNull();
  });
});
