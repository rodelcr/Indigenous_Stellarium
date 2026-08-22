import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateDraft,
  saveDraft,
  listDrafts,
  draftFilename,
} from './draftStore.js';

const goodProvenance = {
  contributor: 'A. Contributor',
  community: 'Rapa Nui',
  source: 'Recorded interview, 2026',
  permission: 'Shared for demo use',
};

function makeDraft(overrides = {}) {
  return {
    culture_key: 'rapa_nui',
    name_english: 'Te Manu',
    name_native: 'Te Manu',
    pronounce: '',
    lines: [[68702, 71683]],
    notes: '',
    provenance: { ...goodProvenance },
    ...overrides,
  };
}

// jsdom is not configured for this project, so provide the minimal
// localStorage surface draftStore uses.
function installMemoryStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  installMemoryStorage();
});

describe('validateDraft', () => {
  it('accepts a draft with all four provenance fields', () => {
    expect(validateDraft(makeDraft())).toEqual([]);
  });

  it.each(['contributor', 'community', 'source', 'permission'])(
    'rejects a draft missing provenance.%s',
    (field) => {
      const prov = { ...goodProvenance };
      delete prov[field];
      const problems = validateDraft(makeDraft({ provenance: prov }));
      expect(problems.join(' ')).toContain(field);
    },
  );

  it.each(['contributor', 'community', 'source', 'permission'])(
    'rejects whitespace-only provenance.%s',
    (field) => {
      const prov = { ...goodProvenance, [field]: '   ' };
      const problems = validateDraft(makeDraft({ provenance: prov }));
      expect(problems.join(' ')).toContain(field);
    },
  );

  it('rejects a draft with no culture selected', () => {
    const problems = validateDraft(makeDraft({ culture_key: '' }));
    expect(problems.join(' ')).toMatch(/sky culture/i);
  });
});

describe('saveDraft', () => {
  it('uses the server when the API answers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 7 }),
    });
    const result = await saveDraft(makeDraft(), { fetchImpl });
    expect(result).toEqual({ mode: 'server', id: 7 });
  });

  it('falls back to local storage when the API is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await saveDraft(makeDraft(), { fetchImpl });
    expect(result.mode).toBe('local');

    const listed = await listDrafts({ fetchImpl });
    expect(listed.mode).toBe('local');
    expect(listed.drafts).toHaveLength(1);
    expect(listed.drafts[0].name_english).toBe('Te Manu');
  });

  it('falls back to local storage when the API path is not served (404)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const result = await saveDraft(makeDraft(), { fetchImpl });
    expect(result.mode).toBe('local');
  });

  // The important one: a server that is reachable and REFUSES the draft must
  // not be quietly routed around. Falling back here would bypass the
  // provenance enforcement the backend exists to apply.
  it('does NOT fall back when the server rejects the draft (422)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: [{ msg: 'provenance.community required' }] }),
    });
    await expect(saveDraft(makeDraft(), { fetchImpl })).rejects.toThrow(/Save failed/);

    const listed = await listDrafts({ fetchImpl: vi.fn().mockRejectedValue(new Error('x')) });
    expect(listed.drafts).toHaveLength(0);
  });

  // The local path must enforce the same floor the server does, or the
  // public demo would accept unattributed community knowledge.
  it('refuses to store a draft locally when provenance is incomplete', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const prov = { ...goodProvenance, community: '' };
    await expect(
      saveDraft(makeDraft({ provenance: prov }), { fetchImpl }),
    ).rejects.toThrow(/community/);

    const listed = await listDrafts({ fetchImpl });
    expect(listed.drafts).toHaveLength(0);
  });
});

describe('draftFilename', () => {
  it('uses the constellation name when present', () => {
    expect(draftFilename(makeDraft())).toBe('Te-Manu.json');
  });

  it('falls back to the culture key, never inventing a name', () => {
    expect(draftFilename(makeDraft({ name_english: '' }))).toBe('rapa_nui.json');
  });
});
