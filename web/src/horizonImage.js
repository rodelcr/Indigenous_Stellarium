// horizonImage.js — object-URL lifecycle for the local horizon panorama.
//
// The panorama a contributor loads is shown as a strip along the bottom of
// the sky. It is DECORATIVE: it is not azimuth-aligned, not tied to the
// engine's coordinate frame, and not a substitute for the engine's real
// landscape pipeline (which consumes pre-tiled HiPS panoramas — see
// docs/superpowers/specs/2026-08-22-phase2-planetarium-tools-design.md §2d).
// The UI says so, because implying more precision than the thing has is how
// people end up trusting an alignment that was never computed.
//
// IT NEVER LEAVES THE BROWSER. No upload, no backend route, no persistence.
// That is not a v1 shortcut to be tidied up later — a horizon photograph
// pins an exact location, some sites must not be publicly geolocated, and
// the photograph itself may be culturally restricted. Until the project has
// a location-privacy model and steward review (neither exists yet), the only
// defensible place for that image is the viewer's own machine. See
// docs/GOVERNANCE.md, "Known open problems".
//
// Consequence for this module: every URL it mints must be revoked, or the
// image data stays alive in the tab for as long as the page is open.

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/** Largest file accepted, in bytes. A panorama is a photo, not a raw scan;
 *  this bound exists so a mistaken selection fails fast and legibly instead
 *  of hanging the tab decoding a 200 MB TIFF. */
export const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Validate a chosen file. Returns null when acceptable, else a message
 * meant to be shown verbatim to the contributor.
 * @param {File|null} file
 */
export function validateHorizonFile(file) {
  if (!file) return 'No file chosen.';
  if (!ACCEPTED.includes(file.type)) {
    return `That file is ${file.type || 'of an unknown type'}. Use a JPEG, PNG, WebP or AVIF image.`;
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `That image is ${mb} MB. The limit is ${MAX_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

/**
 * Create a horizon holder. `createUrl`/`revokeUrl` are injected so the
 * revoke behaviour — the part that actually leaks if it regresses — can be
 * unit-tested without a DOM.
 */
export function createHorizonStore({
  createUrl = (f) => URL.createObjectURL(f),
  revokeUrl = (u) => URL.revokeObjectURL(u),
} = {}) {
  let current = null;

  return {
    /** @returns {string|null} the object URL now in use */
    get url() {
      return current;
    },
    /**
     * Replace the current image. Revokes the previous URL first, so
     * choosing several files in a row cannot accumulate them.
     * @param {File} file
     * @returns {{url: string}|{error: string}}
     */
    set(file) {
      const problem = validateHorizonFile(file);
      if (problem) return { error: problem };
      if (current) revokeUrl(current);
      current = createUrl(file);
      return { url: current };
    },
    /** Drop the image and release its URL. Safe to call when empty. */
    clear() {
      if (current) revokeUrl(current);
      current = null;
    },
  };
}
