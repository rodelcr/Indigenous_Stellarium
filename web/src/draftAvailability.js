// draftAvailability.js — pure logic behind CulturePanel.vue's
// "does this placeholder culture have an exported draft on disk?" probe.
//
// Extracted out of the component's <script setup> closure (which is
// awkward to unit-test directly — see selection.js's parseHip()/
// onStarSelected() split for the same pattern already used elsewhere in
// this codebase) so the one subtle, previously-uncovered rule here can
// be pinned by a plain vitest module test with no DOM/mount required:
//
// Vite's dev server answers ANY unmatched path with 200 + the app's
// index.html (text/html) via its SPA history fallback — NOT a 404. A
// naive `res.ok` check therefore reports every placeholder culture as
// having a draft, even when none was ever exported. Trusting `res.ok`
// alone is exactly the bug this module exists to prevent from being
// silently reintroduced.
//
// checkDraftAvailable() must parse the body as JSON and require a
// string `id` field (the shape of a real exported index.json — see
// scripts/export_skyculture.py's build_index()) before reporting
// "available". Any of: a rejected fetch, a non-ok response, a body that
// isn't valid JSON (the SPA fallback's HTML), or valid JSON missing a
// string `id`, must resolve to `false` and must never throw.
import { assetUrl } from './assetUrl.js';

/**
 * @param {string} id - taxonomy node id (== draft culture_key for a
 *   placeholder, per CulturePanel.vue's selectChild()).
 * @param {typeof fetch} [fetchImpl] - injected for testing; defaults to
 *   the global fetch.
 * @returns {Promise<boolean>}
 */
export async function checkDraftAvailable(id, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(assetUrl('/skycultures/' + id + '/index.json'), { cache: 'no-store' });
    if (!res.ok) return false;
    // res.ok alone isn't proof the file exists -- see module doc above.
    // Parse the body as JSON and check it looks like a sky-culture index
    // (an `id` field) so SPA-fallback HTML is correctly treated as "no
    // draft" rather than a false positive.
    const data = await res.json();
    return !!data && typeof data.id === 'string';
  } catch (err) {
    return false;
  }
}
