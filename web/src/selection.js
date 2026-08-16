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
// Shared engine-subscription plumbing used by both onStarSelected() and
// onSelectionCleared() below. Factored out because both need the exact
// same two pieces of ceremony:
//
// 1. The engine has no removeValueChanged/off API (verified against
//    source); onValueChanged registers a global sink for the whole
//    tree, forever. `unsubscribed` guards the handler body so a caller
//    who has unsubscribed stops receiving events even though the
//    underlying engine callback is never actually removed.
// 2. getStel() returns null until initEngine()'s promise resolves, and
//    callers (e.g. StarInfo.vue's onMounted) run well before that —
//    App.vue awaits initEngine() itself, but its children mount
//    synchronously before that await completes. Poll until the engine
//    is up rather than silently no-op'ing on a null stel. The interval
//    is cleared both when the engine is found and on unsubscribe.
//
// `onChange(stel, path)` is called for every stel value change once the
// engine is ready; callers filter to path === 'selection' themselves.
function subscribeToSelectionChanges(onChange) {
  let unsubscribed = false;
  let pollId = null;

  const attach = (stel) => {
    stel.onValueChanged((path) => {
      if (unsubscribed) return;
      onChange(stel, path);
    });
  };

  const stel = getStel();
  if (stel) {
    attach(stel);
  } else {
    pollId = setInterval(() => {
      const readyStel = getStel();
      if (!readyStel) return;
      clearInterval(pollId);
      pollId = null;
      if (unsubscribed) return;
      attach(readyStel);
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

export function onStarSelected(cb) {
  return subscribeToSelectionChanges((stel, path) => {
    if (path !== 'selection') return;

    const obj = stel.core.selection;
    if (!obj) return;

    const designations = obj.designations();
    const hip = parseHip(designations);
    if (hip === null) return;

    const culturalNames = obj.culturalDesignations();
    cb({ hip, designations, culturalNames, obj });
  });
}

/**
 * Subscribe to engine selection changes that clear or move away from a
 * HIP-bearing star: empty sky, a planet, a DSO, or any other selection
 * that does not resolve to a HIP number. `cb` is called with no
 * arguments in that case. Does NOT fire on a star->star transition
 * (that's still just an onStarSelected update) — it only fires when
 * the new selection is NOT a HIP-bearing star.
 *
 * This exists because onStarSelected() intentionally never fires for
 * non-star selections (see its contract above), which on its own would
 * leave a UI showing star info with no signal to clear it. Kept as a
 * separate subscription rather than folded into onStarSelected's
 * callback so onStarSelected's "HIP-bearing stars only" contract for
 * Task 6 stays untouched.
 *
 * @param {() => void} cb
 * @returns {() => void} unsubscribe function
 */
export function onSelectionCleared(cb) {
  return subscribeToSelectionChanges((stel, path) => {
    if (path !== 'selection') return;

    const obj = stel.core.selection;
    if (!obj) {
      cb();
      return;
    }

    const hip = parseHip(obj.designations());
    if (hip === null) cb();
  });
}
