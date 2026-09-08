// autoFrame.js — zoom to a constellation when, and only when, it is too
// small to see.
//
// The case this serves: Osage Mi-ḳa´-ḳ'e u-ḳi-tha-ç'iⁿ spans 31.3
// ARCMINUTES. Clicking it in the sky selected it, drew it, and showed its
// name in the info panel — and there was nothing visible on screen, because
// at a 50° field of view it is six pixels long. The figure was fine; the
// view was wrong for it.
//
// Two deliberate limits, because auto-moving someone's view is intrusive:
//
//   * CONSTELLATIONS ONLY. Clicking a star must never move the sky. Stars
//     are what the authoring tool is clicked against, and a view that
//     jumps mid-draw would make authoring hostile.
//   * ZOOM IN ONLY (shouldFrame). If the figure already fills a reasonable
//     share of the view, nothing happens. Zooming OUT to "fit" a large
//     figure would throw away a view the user chose, to solve a problem
//     they do not have — Orion was never hard to find.
import { onObjectSelected } from './selection.js';
import { fovForRadius, shouldFrame } from './skyFraming.js';
import { getStel } from './engine.js';

/** True for the engine's constellation objects (`"CON <culture> <name>"`). */
export function isConstellation(designations) {
  return (
    Array.isArray(designations) &&
    designations.some((d) => typeof d === 'string' && d.startsWith('CON '))
  );
}

/**
 * Decide the new field of view for a selection, or null to leave the view
 * alone. Pure, so the policy is testable without an engine.
 */
export function framingFovFor(payload, currentFovRad) {
  if (!payload) return null;
  if (!isConstellation(payload.designations)) return null;
  if (!shouldFrame(payload.radius, currentFovRad)) return null;
  return fovForRadius(payload.radius);
}

/**
 * Subscribe to selection changes and frame small constellations.
 * @returns {() => void} unsubscribe
 */
export function startAutoFraming(getStelFn = getStel) {
  return onObjectSelected((payload) => {
    const stel = getStelFn();
    if (!stel) return;
    const fov = framingFovFor(payload, stel.core.fov);
    if (fov) stel.core.fov = fov;
  });
}
