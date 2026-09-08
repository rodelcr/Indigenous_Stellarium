// waitForEngine.js — retry across animation frames for engine state that
// only exists once a frame has run.
//
// The engine is frame-driven. Setting `skycultures.current_id` does not
// build that culture's constellation objects synchronously; they appear on
// a later frame. So this sequence, which is the obvious one for a user:
//
//     click a culture  ->  click one of its figures
//
// found `stel.getObj('CON osage TaThabthin')` === null and did nothing at
// all. The same lag makes engine state read straight after a write return
// the PREVIOUS value, which caused three separate wrong diagnoses in this
// project — including "the culture switch is broken", which it never was.
//
// Frames, not milliseconds: in a backgrounded tab Chrome throttles
// requestAnimationFrame to zero, so a timer-based retry would burn its
// whole budget while the engine legitimately had not advanced at all.
// Waiting on frames waits on the thing that actually makes progress.

/** Default scheduler: one animation frame. */
const rafSchedule = (fn) =>
  (typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(fn)
    : setTimeout(fn, 16));

/**
 * Call `produce()` until it returns something truthy, once per frame.
 *
 * @param {() => any} produce      cheap, side-effect-free probe
 * @param {object}   [opts]
 * @param {number}   [opts.attempts=60]  ~1s at 60fps; a bounded give-up so
 *                                       a genuinely absent object does not
 *                                       spin forever
 * @param {Function} [opts.schedule]     injected for tests
 * @returns {Promise<any|null>} the value, or null if it never appeared
 */
export function waitFor(produce, opts = {}) {
  const { attempts = 60, schedule = rafSchedule } = opts;
  return new Promise((resolve) => {
    let remaining = attempts;
    const tick = () => {
      let value = null;
      try {
        value = produce();
      } catch {
        value = null;
      }
      if (value) return resolve(value);
      if (--remaining <= 0) return resolve(null);
      schedule(tick);
    };
    tick();
  });
}
