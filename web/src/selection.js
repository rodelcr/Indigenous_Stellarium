// selection.js — star selection helpers.
//
// parseHip() is a pure function: no engine, no DOM, no module-level
// state. onStarSelected() is the only engine-touching piece here, and
// it delegates the actual parsing to parseHip() so that logic stays
// testable without booting the WASM engine.

import { getStel } from './engine.js';

/**
 * Extract the Hipparcos catalog number from an object's designations
 * array (as returned by the engine's `obj.designations()`).
 *
 * @param {string[]} designations
 * @returns {number|null}
 */
export function parseHip(designations) {
  if (!Array.isArray(designations)) return null;
  for (const designation of designations) {
    const match = /^HIP (\d+)$/.exec(designation);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * Subscribe to engine selection changes. `cb` fires only when the
 * newly selected object is a star with a HIP id — clicking a planet,
 * a DSO, or empty sky does not fire it.
 *
 * Payload shape: { hip, designations, culturalNames, obj }
 *
 * @param {(payload: {hip: number, designations: string[], culturalNames: object, obj: object}) => void} cb
 * @returns {() => void} unsubscribe function
 */
export function onStarSelected(cb) {
  const stel = getStel();
  if (!stel) {
    // No engine yet — nothing to subscribe to. Return a no-op
    // unsubscribe so callers don't need to special-case this.
    return () => {};
  }

  let unsubscribed = false;

  // The engine has no removeValueChanged/off API (verified against
  // source); onValueChanged registers a single global sink for the
  // whole tree, forever. Guard the handler body so an unsubscribed
  // caller stops receiving events even though the underlying engine
  // callback is never actually removed.
  const handler = (path) => {
    if (unsubscribed) return;
    if (path !== 'selection') return;

    const obj = stel.core.selection;
    if (!obj) return;

    const designations = obj.designations();
    const hip = parseHip(designations);
    if (hip === null) return;

    const culturalNames = obj.culturalDesignations();
    cb({ hip, designations, culturalNames, obj });
  };

  stel.onValueChanged(handler);

  return () => {
    unsubscribed = true;
  };
}
