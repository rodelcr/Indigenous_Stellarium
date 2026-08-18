// authoring.js — pure constellation-drawing state machine.
//
// Deliberately has no dependency on the engine or the DOM: startDraft()
// returns a fresh closure-based instance holding its own private state, so
// there is no module-level singleton to leak between drafts (two open
// drafts, or two tests, never see each other's stars). This is what makes
// the whole file testable with plain vitest, no WASM engine booted.
//
// Sky-culture `lines` are arrays of HIP numbers (see docs/DESIGN.md's data
// model) — this module stores and returns HIP numbers only. It has no idea
// what a HIP number's display name is; that lookup (culturalNames /
// designations from the onStarSelected payload) lives entirely in
// AuthoringPanel.vue, which is the only place with engine access.

function emptyProvenance() {
  return { contributor: '', community: '', source: '', permission: '' };
}

/**
 * Start a new, independent constellation draft for the given taxonomy node
 * id (`cultureKey` — may be a placeholder node with no dataset yet; that's
 * a first-class authoring target, not an error case here).
 *
 * @param {string} cultureKey
 * @returns {{
 *   addStar: (hip: number) => void,
 *   penUp: () => void,
 *   undo: () => void,
 *   getDraft: () => object,
 *   setMeta: (partial: object) => void,
 * }}
 */
export function startDraft(cultureKey) {
  // `lines`: committed polylines (each closed via penUp() with >= 2 stars).
  // `currentLine`: the in-progress polyline being drawn right now.
  const lines = [];
  let currentLine = [];

  const meta = {
    name_english: '',
    name_native: '',
    pronounce: '',
    notes: '',
    provenance: emptyProvenance(),
  };

  // Appends a HIP star to the in-progress polyline. Consecutive duplicate
  // clicks on the same star (mis-click / double registration) are a no-op;
  // this is checked only against the immediately preceding star in the
  // CURRENT line — starting a new line with the same star that just closed
  // the previous one (a shared joint, the common "chain" case) is allowed
  // and intentional, not caught by this check.
  function addStar(hip) {
    if (currentLine.length > 0 && currentLine[currentLine.length - 1] === hip) {
      return;
    }
    currentLine.push(hip);
  }

  // Closes the in-progress polyline, committing it to `lines` so the next
  // addStar() starts a fresh one. A polyline with fewer than 2 stars is not
  // valid constellation data (a single point draws no line), so penUp() on
  // 0 or 1 pending stars is a no-op rather than pushing a degenerate entry
  // — this also makes calling penUp() twice in a row harmless.
  function penUp() {
    if (currentLine.length < 2) return;
    lines.push(currentLine);
    currentLine = [];
  }

  // Undo walks back through the whole draw timeline one star at a time,
  // not just within the currently-open line:
  //  - if the in-progress line has stars, drop its last star.
  //  - if the in-progress line is empty (e.g. right after a penUp()) but a
  //    line was already committed, reopen that committed line and drop its
  //    last star, so undo can walk back across a penUp() boundary instead
  //    of dead-ending there.
  //  - on a fully empty draft, undo() is a no-op — it must not throw or
  //    fabricate state.
  function undo() {
    if (currentLine.length > 0) {
      currentLine.pop();
      return;
    }
    if (lines.length > 0) {
      currentLine = lines.pop();
      currentLine.pop();
    }
  }

  // Partial, shallow merge — callers (the metadata form) set one field at a
  // time as the contributor types. `provenance` is merged one level deeper
  // so setting `{provenance: {contributor: 'x'}}` doesn't blow away
  // community/source/permission already entered.
  function setMeta(partial) {
    if (!partial) return;
    for (const key of Object.keys(partial)) {
      if (key === 'provenance') {
        meta.provenance = { ...meta.provenance, ...partial.provenance };
      } else {
        meta[key] = partial[key];
      }
    }
  }

  // Computed, not stored: getDraft() derives `lines` fresh each call from
  // the committed lines plus the in-progress line (only if it's already a
  // valid >= 2-star polyline) so that a Save mid-draw — before the
  // contributor has hit pen-up — doesn't silently drop a finished-looking
  // segment. This is also why the brief's own test case works: addStar
  // [1,2,3], penUp(), addStar [3,4] (no second penUp) must already read
  // back as lines == [[1,2,3],[3,4]].
  function getDraft() {
    const allLines = currentLine.length >= 2 ? [...lines, currentLine] : [...lines];
    return {
      culture_key: cultureKey,
      lines: allLines,
      name_english: meta.name_english,
      name_native: meta.name_native,
      pronounce: meta.pronounce,
      notes: meta.notes,
      provenance: { ...meta.provenance },
    };
  }

  return { addStar, penUp, undo, getDraft, setMeta };
}
