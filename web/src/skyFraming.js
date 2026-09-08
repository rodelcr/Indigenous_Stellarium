// skyFraming.js — deciding what field of view shows a figure properly.
//
// Why this exists. Osage Mi-ḳa´-ḳ'e u-ḳi-tha-ç'iⁿ is 31.3 ARCMINUTES across
// and Ṭa Tha´-bthiⁿ is 2.76°. Both load correctly, both draw correctly, and
// at the app's default ~50° field of view they are respectively about 6 and
// 30 pixels long, painted at 0.4 alpha. They were reported as "not showing
// up". Nothing was broken: the sky was simply zoomed too far out to see the
// figures a source actually recorded.
//
// Not every culture draws Orion. A tradition that names a three-star belt
// and a close pair needs the viewer to be able to get to them.
//
// Pure functions, no engine dependency — the engine is driven by the
// caller, so the arithmetic here is unit-testable without WASM.

const DEG = Math.PI / 180;

export const FRAMING_DEFAULTS = Object.freeze({
  // Field of view as a multiple of the figure's DIAMETER. 2.5 leaves the
  // figure filling ~40% of the view: unmistakable, with enough surrounding
  // sky that you can still tell where you are.
  padding: 2.5,
  // Below ~3° the star field is sparse enough to feel lost, and the bundled
  // catalogue (max_vmag 7.0) has nothing more to reveal by going closer.
  minFovDeg: 3,
  // Never zoom further OUT than the app's default view.
  maxFovDeg: 90,
});

/**
 * Field of view (RADIANS) that frames a figure of the given angular RADIUS
 * (radians, as `obj.getInfo('radius')` reports it).
 *
 * Returns null for a missing or nonsensical radius, so callers can leave the
 * view alone rather than jumping somewhere arbitrary.
 */
export function fovForRadius(radiusRad, opts = {}) {
  if (!Number.isFinite(radiusRad) || radiusRad <= 0) return null;
  const { padding, minFovDeg, maxFovDeg } = { ...FRAMING_DEFAULTS, ...opts };
  const diameter = radiusRad * 2;
  const fov = diameter * padding;
  return Math.min(Math.max(fov, minFovDeg * DEG), maxFovDeg * DEG);
}

/**
 * Should selecting this figure move the view?
 *
 * Deliberately one-directional: true only when the figure is SMALL relative
 * to what is currently on screen. Zooming out to fit a large figure would
 * yank the view away from wherever the user had deliberately put it, and
 * large figures were never the problem — you can already see Orion. This
 * fires exactly in the case that prompted it: a figure too small to notice.
 *
 * `threshold` is the figure's diameter as a fraction of the current field of
 * view. At 0.15, a figure spanning less than a seventh of the screen counts
 * as needing help; Ṭa Tha´-bthiⁿ at 2.76° in a 50° view is 0.055.
 */
export function shouldFrame(radiusRad, currentFovRad, threshold = 0.15) {
  if (!Number.isFinite(radiusRad) || radiusRad <= 0) return false;
  if (!Number.isFinite(currentFovRad) || currentFovRad <= 0) return false;
  return (radiusRad * 2) / currentFovRad < threshold;
}
