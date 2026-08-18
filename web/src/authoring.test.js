import { describe, it, expect } from 'vitest';
import { startDraft } from './authoring.js';

// authoring.js is a pure state machine: no engine, no DOM, no module-level
// singleton state. Every test below calls startDraft() fresh so a leak
// between drafts would show up as cross-test contamination.

describe('startDraft / addStar / penUp — polyline building', () => {
  it('builds two segments from addStar/penUp/addStar, sharing a joint star', () => {
    const draft = startDraft('rapa_nui');
    draft.addStar(1);
    draft.addStar(2);
    draft.addStar(3);
    draft.penUp();
    draft.addStar(3);
    draft.addStar(4);
    expect(draft.getDraft().lines).toEqual([[1, 2, 3], [3, 4]]);
  });

  it('does not include a single-point in-progress line in getDraft()', () => {
    const draft = startDraft('rapa_nui');
    draft.addStar(1);
    expect(draft.getDraft().lines).toEqual([]);
  });

  it('includes a valid (>=2 point) in-progress line even without penUp()', () => {
    const draft = startDraft('rapa_nui');
    draft.addStar(1);
    draft.addStar(2);
    expect(draft.getDraft().lines).toEqual([[1, 2]]);
  });
});

describe('undo', () => {
  it('removes the last star from the in-progress line', () => {
    const draft = startDraft('rapa_nui');
    draft.addStar(1);
    draft.addStar(2);
    draft.addStar(3);
    draft.undo();
    expect(draft.getDraft().lines).toEqual([[1, 2]]);
  });

  it('does nothing and does not throw on an empty draft', () => {
    const draft = startDraft('rapa_nui');
    expect(() => draft.undo()).not.toThrow();
    expect(draft.getDraft().lines).toEqual([]);
  });

  it('reopens the last committed line when the in-progress line is empty', () => {
    const draft = startDraft('rapa_nui');
    draft.addStar(1);
    draft.addStar(2);
    draft.addStar(3);
    draft.penUp();
    // currentLine is now empty; undo should reach back into the last
    // committed line rather than being a no-op.
    draft.undo();
    expect(draft.getDraft().lines).toEqual([[1, 2]]);
  });
});

describe('addStar de-duplication', () => {
  it('adding the same star twice consecutively is a no-op', () => {
    const draft = startDraft('rapa_nui');
    draft.addStar(5);
    draft.addStar(5);
    draft.addStar(6);
    expect(draft.getDraft().lines).toEqual([[5, 6]]);
  });

  it('does allow the same star to start a new line right after penUp (shared joint)', () => {
    const draft = startDraft('rapa_nui');
    draft.addStar(1);
    draft.addStar(2);
    draft.penUp();
    draft.addStar(2);
    draft.addStar(3);
    expect(draft.getDraft().lines).toEqual([[1, 2], [2, 3]]);
  });
});

describe('penUp', () => {
  it('calling penUp twice in a row does not create an empty polyline', () => {
    const draft = startDraft('rapa_nui');
    draft.addStar(1);
    draft.addStar(2);
    draft.penUp();
    draft.penUp();
    expect(draft.getDraft().lines).toEqual([[1, 2]]);
  });

  it('penUp on a single-point in-progress line is a no-op — the pending star is kept, not committed or discarded', () => {
    const draft = startDraft('rapa_nui');
    draft.addStar(1);
    draft.penUp();
    draft.addStar(2);
    draft.addStar(3);
    // penUp() did nothing (only 1 star pending), so addStar(2), addStar(3)
    // extend that same still-open line rather than starting a new one.
    expect(draft.getDraft().lines).toEqual([[1, 2, 3]]);
  });

  it('penUp on an empty draft does not throw', () => {
    const draft = startDraft('rapa_nui');
    expect(() => draft.penUp()).not.toThrow();
    expect(draft.getDraft().lines).toEqual([]);
  });
});

describe('getDraft shape', () => {
  it('carries culture_key and default empty metadata/provenance fields', () => {
    const draft = startDraft('maori');
    const data = draft.getDraft();
    expect(data.culture_key).toBe('maori');
    expect(data.lines).toEqual([]);
    expect(data.name_english).toBe('');
    expect(data.name_native).toBe('');
    expect(data.pronounce).toBe('');
    expect(data.notes).toBe('');
    expect(data.provenance).toEqual({
      contributor: '',
      community: '',
      source: '',
      permission: '',
    });
  });
});

describe('setMeta', () => {
  it('merges top-level metadata fields without clobbering others', () => {
    const draft = startDraft('maori');
    draft.setMeta({ name_english: 'Foo' });
    draft.setMeta({ name_native: 'Bar' });
    const data = draft.getDraft();
    expect(data.name_english).toBe('Foo');
    expect(data.name_native).toBe('Bar');
  });

  it('merges provenance fields incrementally rather than overwriting the object', () => {
    const draft = startDraft('maori');
    draft.setMeta({ provenance: { contributor: 'Alice' } });
    draft.setMeta({ provenance: { community: 'Some Community' } });
    const data = draft.getDraft();
    expect(data.provenance).toEqual({
      contributor: 'Alice',
      community: 'Some Community',
      source: '',
      permission: '',
    });
  });
});

describe('independence between draft instances', () => {
  it('does not leak state between two startDraft() calls', () => {
    const draftA = startDraft('rapa_nui');
    draftA.addStar(1);
    draftA.addStar(2);

    const draftB = startDraft('mapuche');
    expect(draftB.getDraft().lines).toEqual([]);
    expect(draftB.getDraft().culture_key).toBe('mapuche');

    // draftA is unaffected by draftB's existence.
    expect(draftA.getDraft().lines).toEqual([[1, 2]]);
    expect(draftA.getDraft().culture_key).toBe('rapa_nui');
  });
});
