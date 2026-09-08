// constellationList.js — turning a sky culture's index.json into a list a
// person can actually navigate.
//
// Two problems this solves, and the second is the important one.
//
// 1. Discoverability. Nothing in the app ever told you WHAT figures a
//    culture contains. You found them by panning the sky and hoping. That
//    is workable for Orion and hopeless for a 31-arcminute figure.
//
// 2. Honesty about missing geometry. Several cultures here record a figure's
//    NAME but not its shape — Ojibwe and D(L)akota record no star lists at
//    all, and yana_phuyu's dark-cloud figures are described in prose. Those
//    figures are real and belong in the list. What they must not do is look
//    like a broken link: a name you click that does nothing reads as a bug,
//    and invites someone to "fix" it by inventing an outline. So `hasLines`
//    is part of the model, the UI states it, and the entry is not clickable.
//
// Pure — takes parsed JSON, returns plain data. No fetch, no engine.

/**
 * @param {object} index  a sky culture's parsed index.json
 * @returns {Array<{id, english, native, pronounce, hasLines, starCount}>}
 *   Drawable figures first (those are the ones the list can take you to),
 *   each group sorted by the name shown.
 */
export function listConstellations(index) {
  const cons = index?.constellations;
  if (!Array.isArray(cons)) return [];

  const entries = cons.map((con) => {
    const name = con?.common_name ?? {};
    // Count the stars the lines actually reference, so the UI can
    // distinguish a real polyline from an empty `lines: []`.
    const starCount = Array.isArray(con?.lines)
      ? con.lines.reduce((n, poly) => n + (Array.isArray(poly) ? poly.length : 0), 0)
      : 0;
    return {
      id: con?.id ?? '',
      english: (name.english ?? '').trim(),
      native: (name.native ?? '').trim(),
      pronounce: (name.pronounce ?? '').trim(),
      // A single point is not a line. The engine rejects such a figure
      // outright ("has no lines and no illustration"), so treating it as
      // drawable here would produce an entry that navigates nowhere.
      hasLines: starCount >= 2,
      starCount,
    };
  });

  // Sort by the SAME string the UI shows (displayName), not by the English
  // gloss. Ordering a list by a field the reader cannot see looks random.
  return entries.sort((a, b) => {
    if (a.hasLines !== b.hasLines) return a.hasLines ? -1 : 1;
    return displayName(a).localeCompare(displayName(b));
  });
}

/** The name to show, preferring the culture's own word for it. */
export function displayName(entry) {
  return entry.native || entry.english || entry.pronounce || entry.id;
}

/** The gloss shown beneath the name, omitted when it would just repeat it. */
export function displayGloss(entry) {
  const name = displayName(entry);
  return entry.english && entry.english !== name ? entry.english : '';
}
