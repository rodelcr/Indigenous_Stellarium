import { describe, it, expect, vi } from 'vitest';
import { checkDraftAvailable } from './draftAvailability.js';

// checkDraftAvailable() is the extracted, pure-async form of
// CulturePanel.vue's draft-availability probe (see that file's doc
// comment and draftAvailability.js's module doc for the full story).
// These tests pin the specific bug caught during Task 8's manual
// verification: Vite's dev server SPA-fallback answers ANY unmatched
// path with 200 + index.html, so `res.ok` alone is not proof a draft
// exists -- the body must be parsed as JSON and checked for a string
// `id` field.
//
// fetch is injected (second arg) rather than mocked globally, so these
// tests need no DOM/mount environment -- see draftAvailability.js's doc
// comment for why that split was made.

function fakeFetch(response) {
  return vi.fn().mockResolvedValue(response);
}

describe('checkDraftAvailable', () => {
  it('treats an HTML SPA-fallback response (200, res.json() rejects) as unavailable', async () => {
    const res = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
    };
    const available = await checkDraftAvailable('rapa_nui', fakeFetch(res));
    expect(available).toBe(false);
  });

  it('treats a real JSON body with a string id as available', async () => {
    const res = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'rapa_nui', constellations: [] }),
    };
    const available = await checkDraftAvailable('rapa_nui', fakeFetch(res));
    expect(available).toBe(true);
  });

  it('treats a genuine 404 as unavailable', async () => {
    const res = {
      ok: false,
      status: 404,
      json: () => Promise.reject(new Error('should not be called')),
    };
    const available = await checkDraftAvailable('rapa_nui', fakeFetch(res));
    expect(available).toBe(false);
  });

  it('treats a 200 JSON body missing id as unavailable', async () => {
    const res = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ constellations: [] }),
    };
    const available = await checkDraftAvailable('rapa_nui', fakeFetch(res));
    expect(available).toBe(false);
  });

  it('treats a 200 JSON body where id is not a string as unavailable', async () => {
    const res = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 12345 }),
    };
    const available = await checkDraftAvailable('rapa_nui', fakeFetch(res));
    expect(available).toBe(false);
  });

  it('treats a network rejection as unavailable, and does not throw', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(checkDraftAvailable('rapa_nui', fetchImpl)).resolves.toBe(false);
  });
});
