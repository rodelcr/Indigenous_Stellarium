import { describe, it, expect } from 'vitest';
import { isConstellation, framingFovFor } from './autoFrame.js';

const DEG = Math.PI / 180;
const ARCMIN = DEG / 60;
const WIDE = 50 * DEG;

const sel = (designations, radius) => ({ designations, radius });

describe('isConstellation', () => {
  it('recognises the engine\'s constellation designations', () => {
    expect(isConstellation(['CON osage TaThabthin'])).toBe(true);
    expect(isConstellation(['CON western Ori'])).toBe(true);
  });

  it('does not match stars, DSOs or junk', () => {
    expect(isConstellation(['Alnilam', '* eps Ori', 'HIP 26311'])).toBe(false);
    expect(isConstellation(['NAME Pleiades', 'M 45'])).toBe(false);
    expect(isConstellation([])).toBe(false);
    expect(isConstellation(undefined)).toBe(false);
  });
});

describe('framingFovFor', () => {
  it('frames a constellation too small to see', () => {
    const fov = framingFovFor(sel(['CON osage TaThabthin'], 1.38 * DEG), WIDE);
    expect(fov / DEG).toBeCloseTo(2.76 * 2.5, 5);
  });

  it('never moves the view for a star', () => {
    // Clicking stars is how constellations are authored; a jumping view
    // would make the authoring tool unusable.
    expect(framingFovFor(sel(['HIP 26311'], 1.38 * DEG), WIDE)).toBeNull();
  });

  it('never zooms OUT to fit a large constellation', () => {
    // Orion was always findable. Yanking the view wider to "fit" it would
    // discard a view the user deliberately chose.
    expect(framingFovFor(sel(['CON western Ori'], 20 * DEG), 8 * DEG)).toBeNull();
  });

  it('stops interfering once the user has zoomed in themselves', () => {
    const small = sel(['CON osage Mikakeukithacin'], (31.3 / 2) * ARCMIN);
    expect(framingFovFor(small, WIDE)).not.toBeNull();
    expect(framingFovFor(small, 2 * DEG)).toBeNull();
  });

  it('leaves the view alone when the selection is cleared or sizeless', () => {
    expect(framingFovFor(null, WIDE)).toBeNull();
    expect(framingFovFor(sel(['CON x Y'], undefined), WIDE)).toBeNull();
    expect(framingFovFor(sel(['CON x Y'], NaN), WIDE)).toBeNull();
  });
});
