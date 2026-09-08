import { describe, it, expect, vi } from 'vitest';
import { waitFor } from './waitForEngine.js';

// A scheduler that runs immediately, so tests never depend on real frames.
const immediate = (fn) => fn();

describe('waitFor', () => {
  it('returns a value that is already available without waiting', async () => {
    const schedule = vi.fn(immediate);
    expect(await waitFor(() => 'here', { schedule })).toBe('here');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('returns the value once a later frame produces it', async () => {
    // This is the real case: the engine builds a culture's constellations
    // on a frame after current_id is set.
    let frame = 0;
    const produce = () => (++frame >= 4 ? { id: 'CON osage TaThabthin' } : null);
    expect(await waitFor(produce, { schedule: immediate })).toEqual({
      id: 'CON osage TaThabthin',
    });
  });

  it('gives up after the attempt budget rather than spinning forever', async () => {
    const produce = vi.fn(() => null);
    expect(await waitFor(produce, { attempts: 5, schedule: immediate })).toBeNull();
    expect(produce).toHaveBeenCalledTimes(5);
  });

  it('treats a throwing probe as "not yet" instead of rejecting', async () => {
    // getObj() on a half-initialised engine can throw rather than return null.
    let n = 0;
    const produce = () => {
      if (++n < 3) throw new Error('engine not ready');
      return 'ok';
    };
    await expect(waitFor(produce, { schedule: immediate })).resolves.toBe('ok');
  });

  it('never resolves truthy for a falsy-but-valid probe result', async () => {
    // Guards the contract: callers use truthiness, so a probe returning 0
    // or '' must keep waiting rather than resolve.
    expect(await waitFor(() => 0, { attempts: 2, schedule: immediate })).toBeNull();
  });
});
