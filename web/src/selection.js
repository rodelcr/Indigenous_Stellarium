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
 * `culturalNames` is the direct, unmodified return value of the
 * engine's `obj.culturalDesignations()` — an ARRAY of name entries
 * (verified against engine source,
 * vendor/stellarium-web-engine/src/js/obj.js: "Return an array of
 * objects with attributes: 'name_native', 'name_english',
 * 'name_pronounce', ..."), not a single object. A star can have more
 * than one alternate name entry for the active culture.
 *
 * @param {(payload: {hip: number, designations: string[], culturalNames: Array<{name_native?: string, name_english?: string, name_pronounce?: string}>, obj: object}) => void} cb
 * @returns {() => void} unsubscribe function
 */
export function onStarSelected(cb) {
  let unsubscribed = false;

  // The engine has no removeValueChanged/off API (verified against
  // source); onValueChanged registers a single global sink for the
  // whole tree, forever. Guard the handler body so an unsubscribed
  // caller stops receiving events even though the underlying engine
  // callback is never actually removed.
  const handler = (stel) => (path) => {
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

  // getStel() returns null until initEngine()'s promise resolves, and
  // callers of onStarSelected (e.g. StarInfo.vue's onMounted) run well
  // before that — App.vue awaits initEngine() itself, but its children
  // mount synchronously before that await completes. Poll until the
  // engine is up rather than silently no-op'ing on a null stel.
  let pollId = null;
  const stel = getStel();
  if (stel) {
    stel.onValueChanged(handler(stel));
  } else {
    pollId = setInterval(() => {
      const readyStel = getStel();
      if (!readyStel) return;
      clearInterval(pollId);
      pollId = null;
      if (unsubscribed) return;
      readyStel.onValueChanged(handler(readyStel));
    }, 200);
  }

  return () => {
    unsubscribed = true;
    if (pollId !== null) {
      clearInterval(pollId);
      pollId = null;
    }
  };
}
