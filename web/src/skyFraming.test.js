import { describe, it, expect } from 'vitest';
import { fovForRadius, shouldFrame, FRAMING_DEFAULTS } from './skyFraming.js';

const DEG = Math.PI / 180;
const ARCMIN = DEG / 60;

// The two figures that prompted this module, at their engine-reported sizes.
const THREE_DEER_RADIUS = 2.76 * DEG / 2;     // 2.76° across
const DOUBLE_STAR_RADIUS = 31.3 * ARCMIN / 2; // 31.3′ across

describe('fovForRadius', () => {
  it('frames a small figure so it fills a useful part of the view', () => {
    const fov = fovForRadius(THREE_DEER_RADIUS) / DEG;
    expect(fov).toBeCloseTo(2.76 * 2.5, 5);
    // Verified in the browser: 8° made this figure unmistakable, 50° hid it.
    expect(fov).toBeLessThan(10);
  });

  it('clamps a very small figure to a floor rather than zooming to nothing', () => {
    // Unclamped this would be 1.3°, past the point where the bundled star
    // catalogue has anything left to show.
    expect(fovForRadius(DOUBLE_STAR_RADIUS)).toBe(FRAMING_DEFAULTS.minFovDeg * DEG);
  });

  it('clamps a large figure to the maximum rather than zooming out forever', () => {
    expect(fovForRadius(80 * DEG)).toBe(FRAMING_DEFAULTS.maxFovDeg * DEG);
  });

  it('returns null for a radius the engine could not supply', () => {
    for (const bad of [undefined, null, NaN, 0, -1, Infinity]) {
      expect(fovForRadius(bad)).toBeNull();
    }
  });
});

describe('shouldFrame', () => {
  it('fires for the figures that were invisible at the default view', () => {
    expect(shouldFrame(THREE_DEER_RADIUS, 50 * DEG)).toBe(true);
    expect(shouldFrame(DOUBLE_STAR_RADIUS, 50 * DEG)).toBe(true);
  });

  it('does NOT fire for a figure already filling the view', () => {
    // Zooming out to "fit" would throw away a view the user chose.
    expect(shouldFrame(20 * DEG, 50 * DEG)).toBe(false);
  });

  it('stops firing once the user has zoomed in far enough themselves', () => {
    expect(shouldFrame(THREE_DEER_RADIUS, 50 * DEG)).toBe(true);
    expect(shouldFrame(THREE_DEER_RADIUS, 8 * DEG)).toBe(false);
  });

  it('is false when either input is missing', () => {
    expect(shouldFrame(NaN, 50 * DEG)).toBe(false);
    expect(shouldFrame(THREE_DEER_RADIUS, NaN)).toBe(false);
    expect(shouldFrame(THREE_DEER_RADIUS, 0)).toBe(false);
  });
});
