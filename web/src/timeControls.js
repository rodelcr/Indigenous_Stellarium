// timeControls.js — pure time helpers behind TimeControl.vue.
//
// Kept out of the component for the same reason authoring.js is: this is
// arithmetic with off-by-one-day failure modes that a browser click-through
// will not reliably catch, and a planetarium showing the wrong date is
// wrong in a way that looks plausible.
//
// The engine stores observer time as a Modified Julian Date on
// `core.observer.utc`, and exposes its own MJD2date/date2MJD on the `stel`
// object. These duplicate that conversion ON PURPOSE, so the sequencing and
// formatting below can be unit-tested without booting WebAssembly; they are
// pinned against the engine's exact expressions (src/js/pre.js:92-98) by
// the tests, so a drift shows up as a failure rather than a silent shift.

const MS_PER_DAY = 86400000;
// The engine's own constants, kept in this two-step form ON PURPOSE.
// Folding them to the algebraically-equal `+ 40587` is *more* accurate in
// floating point, and that is exactly the problem: it disagrees with the
// engine by ~1.8e-10 days. These values are written into and read back out
// of core.observer.utc, so agreeing with the engine matters more than being
// marginally closer to the real number. 16 microseconds is nothing; a value
// that fails to round-trip is a bug.
const MJD_OFFSET_A = 2400000.5;
const MJD_OFFSET_B = 2440587.5;

/** @param {Date} date @returns {number} Modified Julian Date */
export function dateToMjd(date) {
  return date.getTime() / MS_PER_DAY - MJD_OFFSET_A + MJD_OFFSET_B;
}

/** @param {number} mjd @returns {Date} */
export function mjdToDate(mjd) {
  return new Date(Math.round((mjd + MJD_OFFSET_A - MJD_OFFSET_B) * MS_PER_DAY));
}

/**
 * Time-speed ladder, in simulated seconds per real second. Mirrors
 * Stellarium's own convention of discrete steps rather than a continuous
 * slider: a planetarium audience needs to be able to say "put it back to
 * real time", and a slider cannot be landed on exactly.
 *
 * 0 is paused. 1 is real time. 86400 is one day per second, which is the
 * useful rate for watching a constellation's season change.
 */
export const SPEED_LADDER = [
  -86400, -3600, -300, -60, -10, -1, 0, 1, 10, 60, 300, 3600, 86400,
];

/** Real time, the value the "now" control returns to. */
export const REAL_TIME = 1;

/**
 * Step along the ladder. `direction` is +1 (forward/faster) or -1
 * (backward/faster-reverse). Clamps at the ends rather than wrapping —
 * wrapping from fastest-forward to fastest-reverse on one extra click
 * would be a genuinely disorienting thing to do to a viewer.
 *
 * A current speed that is not on the ladder (someone set it directly)
 * snaps to the nearest rung first, so the control stays predictable.
 */
export function nextSpeed(current, direction) {
  let i = SPEED_LADDER.indexOf(current);
  if (i === -1) {
    let best = 0;
    for (let k = 1; k < SPEED_LADDER.length; k++) {
      if (Math.abs(SPEED_LADDER[k] - current) < Math.abs(SPEED_LADDER[best] - current)) best = k;
    }
    i = best;
  }
  const next = i + (direction >= 0 ? 1 : -1);
  if (next < 0) return SPEED_LADDER[0];
  if (next >= SPEED_LADDER.length) return SPEED_LADDER[SPEED_LADDER.length - 1];
  return SPEED_LADDER[next];
}

/** Human label for a ladder speed. */
export function formatSpeed(speed) {
  if (speed === 0) return 'paused';
  if (speed === 1) return 'real time';
  const sign = speed < 0 ? '−' : '';
  const s = Math.abs(speed);
  if (s === 86400) return `${sign}1 day/s`;
  if (s >= 3600) return `${sign}${s / 3600} h/s`;
  if (s >= 60) return `${sign}${s / 60} min/s`;
  return `${sign}${s}×`;
}

/**
 * Display string for the observer clock. UTC, stated as UTC — a
 * planetarium that shows an unlabelled local time invites the reader to
 * mis-set it, and every engine value here is UTC.
 */
export function formatUtc(date) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${p(date.getUTCFullYear(), 4)}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}` +
    ` ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())} UTC`
  );
}

/**
 * Value for an <input type="datetime-local">, which has no timezone and
 * is therefore read back as LOCAL time by the browser. We deliberately
 * feed it the UTC field values and label the input UTC, so what the user
 * types is what the observer gets, with no silent offset.
 */
export function toDateTimeLocalValue(date) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${p(date.getUTCFullYear(), 4)}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}:${p(date.getUTCMinutes())}`
  );
}

/**
 * Inverse of toDateTimeLocalValue: read the field values back as UTC.
 * Returns null for an unparseable/empty value rather than an Invalid Date,
 * so callers cannot accidentally push NaN into the engine clock.
 */
export function fromDateTimeLocalValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value || '');
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  return Number.isNaN(ms) ? null : new Date(ms);
}
