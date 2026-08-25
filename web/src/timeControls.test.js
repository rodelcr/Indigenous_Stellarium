import { describe, it, expect } from 'vitest'
import {
  dateToMjd, mjdToDate, nextSpeed, formatSpeed, formatUtc,
  toDateTimeLocalValue, fromDateTimeLocalValue, SPEED_LADDER,
} from './timeControls.js'

describe('MJD conversion', () => {
  // Pinned against the engine's own expressions in src/js/pre.js:92-98:
  //   MJD2date(v) = new Date(Math.round((v + 2400000.5 - 2440587.5) * 86400000))
  //   date2MJD(d) = d / 86400000 - 2400000.5 + 2440587.5
  // If our copy drifts from the engine's, the clock silently shifts.
  const engineDateToMjd = (d) => d.getTime() / 86400000 - 2400000.5 + 2440587.5
  const engineMjdToDate = (v) => new Date(Math.round((v + 2400000.5 - 2440587.5) * 86400000))

  it('matches the engine formula exactly across a wide date range', () => {
    for (const iso of ['1970-01-01T00:00:00Z', '2000-01-01T12:00:00Z',
                       '2026-08-24T21:15:30Z', '2099-12-31T23:59:59Z',
                       '1899-12-31T00:00:00Z']) {
      const d = new Date(iso)
      expect(dateToMjd(d)).toBe(engineDateToMjd(d))
      expect(mjdToDate(dateToMjd(d)).getTime()).toBe(engineMjdToDate(engineDateToMjd(d)).getTime())
    }
  })

  it('round-trips to the same second', () => {
    const d = new Date('2026-08-24T21:15:30Z')
    expect(mjdToDate(dateToMjd(d)).toISOString()).toBe(d.toISOString())
  })

  it('the Unix epoch is MJD 40587', () => {
    // Not exactly 40587 in floating point, because we deliberately keep the
    // engine's two-step form rather than the algebraically-equal constant.
    expect(dateToMjd(new Date('1970-01-01T00:00:00Z'))).toBeCloseTo(40587, 6)
  })
})

describe('speed ladder', () => {
  it('has a single paused rung and is symmetric', () => {
    expect(SPEED_LADDER.filter((s) => s === 0)).toHaveLength(1)
    const pos = SPEED_LADDER.filter((s) => s > 0)
    const neg = SPEED_LADDER.filter((s) => s < 0).map((s) => -s).reverse()
    expect(neg).toEqual(pos)
  })

  it('steps up and down one rung at a time', () => {
    expect(nextSpeed(0, +1)).toBe(1)
    expect(nextSpeed(1, +1)).toBe(10)
    expect(nextSpeed(0, -1)).toBe(-1)
    expect(nextSpeed(-1, -1)).toBe(-10)
  })

  it('passes through zero rather than skipping it', () => {
    expect(nextSpeed(1, -1)).toBe(0)
    expect(nextSpeed(-1, +1)).toBe(0)
  })

  it('clamps at the ends instead of wrapping', () => {
    const fastest = SPEED_LADDER[SPEED_LADDER.length - 1]
    const slowest = SPEED_LADDER[0]
    expect(nextSpeed(fastest, +1)).toBe(fastest)
    expect(nextSpeed(slowest, -1)).toBe(slowest)
  })

  it('snaps an off-ladder speed to the nearest rung', () => {
    expect(nextSpeed(55, +1)).toBe(300)   // nearest rung is 60, step up
    expect(nextSpeed(2, -1)).toBe(0)      // nearest rung is 1, step down
  })
})

describe('labels', () => {
  it('names the meaningful speeds in words, not numbers', () => {
    expect(formatSpeed(0)).toBe('paused')
    expect(formatSpeed(1)).toBe('real time')
    expect(formatSpeed(86400)).toBe('1 day/s')
    expect(formatSpeed(3600)).toBe('1 h/s')
    expect(formatSpeed(60)).toBe('1 min/s')
  })

  it('marks reverse speeds', () => {
    expect(formatSpeed(-86400)).toContain('1 day/s')
    expect(formatSpeed(-86400).startsWith('−')).toBe(true)
  })

  it('states the clock as UTC', () => {
    expect(formatUtc(new Date('2026-08-24T21:05:03Z'))).toBe('2026-08-24 21:05:03 UTC')
  })
})

describe('datetime-local field round trip', () => {
  // <input type="datetime-local"> carries no timezone, so the browser reads
  // it back as LOCAL time. Feeding it UTC field values and reading them back
  // as UTC is what keeps the observer clock from silently shifting by the
  // viewer's offset -- a bug that would look like "the sky is a few hours
  // wrong" and be blamed on the ephemeris.
  it('round-trips without applying a timezone offset', () => {
    const d = new Date('2026-08-24T21:15:00Z')
    const v = toDateTimeLocalValue(d)
    expect(v).toBe('2026-08-24T21:15')
    expect(fromDateTimeLocalValue(v).toISOString()).toBe('2026-08-24T21:15:00.000Z')
  })

  it('accepts an optional seconds component', () => {
    expect(fromDateTimeLocalValue('2026-08-24T21:15:30').toISOString())
      .toBe('2026-08-24T21:15:30.000Z')
  })

  it('returns null rather than an Invalid Date, so NaN never reaches the clock', () => {
    for (const bad of ['', null, undefined, 'tomorrow', '2026-08-24', 'x']) {
      expect(fromDateTimeLocalValue(bad)).toBeNull()
    }
  })
})
