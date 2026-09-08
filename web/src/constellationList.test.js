import { describe, it, expect } from 'vitest';
import { listConstellations, displayName, displayGloss } from './constellationList.js';

// Shaped after the real files in data/skycultures_authored/.
const OSAGE = {
  id: 'osage',
  constellations: [
    { id: 'CON osage Wabaha', common_name: { english: 'Litter, the stretcher', native: 'Wa´-ba-ha' } },
    { id: 'CON osage TaThabthin', common_name: { english: 'Three-deer', native: 'Ṭa Tha´-bthiⁿ' }, lines: [[26727, 26311, 25930]] },
    { id: 'CON osage Mikakeukithacin', common_name: { english: 'Double-star', native: "Mi-ḳa´-ḳ'e u-ḳi-tha-ç'iⁿ" }, lines: [[26221, 26241]] },
  ],
};

describe('listConstellations', () => {
  it('puts drawable figures first, so the navigable ones are reachable', () => {
    const list = listConstellations(OSAGE);
    expect(list.map((e) => e.hasLines)).toEqual([true, true, false]);
  });

  it('keeps a name-only figure in the list rather than hiding it', () => {
    // Wa´-ba-ha is recorded by La Flesche; we withheld his chart. Dropping
    // the figure would misrepresent the source as not naming it at all.
    const list = listConstellations(OSAGE);
    expect(list.find((e) => e.id === 'CON osage Wabaha')).toBeTruthy();
  });

  it('counts the stars a figure references', () => {
    const list = listConstellations(OSAGE);
    expect(list.find((e) => e.english === 'Three-deer').starCount).toBe(3);
    expect(list.find((e) => e.english === 'Double-star').starCount).toBe(2);
  });

  it('treats a one-star "line" as not drawable', () => {
    // The engine rejects such a figure outright, so an entry offering to
    // navigate to it would go nowhere.
    const [entry] = listConstellations({
      constellations: [{ id: 'CON x Y', common_name: { english: 'Y' }, lines: [[42]] }],
    });
    expect(entry.hasLines).toBe(false);
  });

  it('handles a culture with no geometry at all', () => {
    // Ojibwe and D(L)akota: names published, star lists not.
    const list = listConstellations({
      constellations: [
        { id: 'CON ojibwe Ojiig', common_name: { english: 'Fischer', native: 'Ojiig' } },
        { id: 'CON ojibwe Mooz', common_name: { english: 'Moose', native: 'Mooz' } },
      ],
    });
    expect(list).toHaveLength(2);
    expect(list.every((e) => !e.hasLines)).toBe(true);
  });

  it('returns [] for malformed or empty input rather than throwing', () => {
    for (const bad of [undefined, null, {}, { constellations: null }]) {
      expect(listConstellations(bad)).toEqual([]);
    }
  });
});

describe('display helpers', () => {
  it('shows the culture\'s own word for the figure, not the translation', () => {
    const entry = listConstellations(OSAGE).find((e) => e.english === 'Three-deer');
    expect(displayName(entry)).toBe('Ṭa Tha´-bthiⁿ');
    expect(displayGloss(entry)).toBe('Three-deer');
  });

  it('orders by the name shown, so the ordering is legible to the reader', () => {
    // Sorting by the English gloss while displaying the native name would
    // look arbitrary on screen.
    const drawable = listConstellations(OSAGE).filter((e) => e.hasLines);
    expect(drawable.map(displayName)).toEqual(
      [...drawable.map(displayName)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('does not repeat the name as its own gloss', () => {
    const entry = { id: 'CON x Y', english: 'Nanaboujou', native: 'Nanaboujou' };
    expect(displayName(entry)).toBe('Nanaboujou');
    expect(displayGloss(entry)).toBe('');
  });

  it('falls back through native -> english -> id', () => {
    expect(displayName({ id: 'CON x Y', english: 'Moose', native: '' })).toBe('Moose');
    expect(displayName({ id: 'CON x Y', english: '', native: '' })).toBe('CON x Y');
  });
});
