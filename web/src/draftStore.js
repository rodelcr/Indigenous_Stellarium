// draftStore.js — where a contributor's drafts go.
//
// Two backends, chosen at runtime rather than at build time:
//
//   1. The FastAPI backend at /api/drafts, when one is reachable (local dev,
//      or a Docker deployment).
//   2. The visitor's own browser (localStorage), when it is not — which is
//      the case on the free static Hugging Face Space, where there is no
//      server at all.
//
// The static case is not merely a degraded mode. Steward review is Phase 2
// and does not exist yet, so a public server collecting community knowledge
// would be accepting submissions nobody is looking after. Keeping drafts in
// the visitor's own browser means nothing they author leaves their machine.
//
// THAT LAST SENTENCE USED TO BE FALSE, and the UI repeated it to visitors.
// Runtime detection works by POSTing the draft and treating a 404 as "no
// backend" — which means the complete draft (contributor name, community,
// source, permission statement, authored geometry) was transmitted to the
// static host BEFORE we learned there was nothing there to receive it, where
// the CDN edge terminates the request and can log it. Meanwhile the
// attribution panel told the visitor their drafts were "never transmitted
// anywhere — not to us, not to anyone."
//
// A static build therefore short-circuits to local storage WITHOUT any
// network call. The deploy kind is known at build time (deploy/pages.sh sets
// VITE_DEPLOY_KIND=static), so probing for a backend that cannot exist buys
// nothing and costs the exact guarantee the UI is making. Runtime detection
// stays for every other deploy, where a backend may or may not be mounted.
//
// IMPORTANT — a rejection is not a fallback trigger. If the server is
// reachable and *refuses* a draft (e.g. 422 for missing provenance), that
// refusal stands and is surfaced to the contributor. Falling back to local
// storage on a validation error would silently bypass the provenance rules
// the backend enforces, which is exactly the guarantee this project cannot
// afford to lose. Only an unreachable server falls back.

import { assetUrl } from './assetUrl.js';

const STORAGE_KEY = 'indigenous-stellarium.drafts.v1';

/** True when this bundle was built for a deployment with no backend at all.
 *  Set by deploy/pages.sh; see the module header for why this must gate the
 *  network call rather than merely describe it. */
export const IS_STATIC_DEPLOY = import.meta.env.VITE_DEPLOY_KIND === 'static';

/** Fields that must be present and non-blank on every draft. Mirrors the
 *  backend's Provenance model (app.py) so the local path enforces the same
 *  floor the server does — a demo that accepted unattributed knowledge would
 *  teach exactly the wrong thing. */
const REQUIRED_PROVENANCE = ['contributor', 'community', 'source', 'permission'];

/**
 * Validate a draft the way the backend does: culture_key and all four
 * provenance fields present and non-blank after trimming.
 *
 * @param {object} draft
 * @returns {string[]} human-readable problems; empty means valid.
 */
export function validateDraft(draft) {
  const problems = [];
  if (!draft || typeof draft !== 'object') return ['Draft is empty.'];

  const blank = (v) => typeof v !== 'string' || v.trim() === '';

  if (blank(draft.culture_key)) problems.push('No sky culture selected.');

  const prov = draft.provenance || {};
  for (const field of REQUIRED_PROVENANCE) {
    if (blank(prov[field])) problems.push(`Provenance: ${field} is required.`);
  }
  return problems;
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // Corrupt or unavailable storage (private browsing, quota) — treat as
    // empty rather than breaking the panel.
    return [];
  }
}

function writeLocal(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * Persist a draft. Tries the API first; falls back to localStorage only when
 * the API is unreachable.
 *
 * @param {object} draft — the shape returned by authoring.js's getDraft()
 * @returns {Promise<{mode: 'server'|'local', id: number|string}>}
 * @throws {Error} if the server rejected the draft, or if local validation
 *   failed — callers should surface the message to the contributor.
 */
export async function saveDraft(
  draft,
  { fetchImpl = globalThis.fetch, staticDeploy = IS_STATIC_DEPLOY } = {}
) {
  // No backend can exist here, so do not transmit the draft to find that out.
  if (staticDeploy) return saveLocal(draft);

  let res;
  try {
    res = await fetchImpl(assetUrl('/api/drafts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
  } catch (err) {
    // Unreachable: no backend deployed. Fall back.
    return saveLocal(draft);
  }

  // A 404 means the path isn't served at all (static host answering with its
  // SPA fallback, or no API mounted) — that is "no backend", not a rejection.
  if (res.status === 404) return saveLocal(draft);

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body && body.detail ? JSON.stringify(body.detail) : `HTTP ${res.status}`;
    throw new Error(`Save failed: ${detail}`);
  }

  const body = await res.json();
  return { mode: 'server', id: body.id };
}

function saveLocal(draft) {
  const problems = validateDraft(draft);
  if (problems.length) throw new Error(problems.join(' '));

  const list = readLocal();
  const id = `local-${list.length + 1}-${list.reduce((n, d) => Math.max(n, 0), 0) + Date.now()}`;
  const row = { ...draft, id, status: 'draft', kind: 'polyline', stored: 'local' };
  list.unshift(row);
  writeLocal(list);
  return { mode: 'local', id };
}

/**
 * List saved drafts. Tries the API; falls back to localStorage when the API
 * is unreachable or not served.
 *
 * @returns {Promise<{mode: 'server'|'local', drafts: object[]}>}
 */
export async function listDrafts(
  { fetchImpl = globalThis.fetch, staticDeploy = IS_STATIC_DEPLOY } = {}
) {
  if (staticDeploy) return { mode: 'local', drafts: readLocal() };

  try {
    const res = await fetchImpl(assetUrl('/api/drafts'));
    if (res.status === 404 || !res.ok) return { mode: 'local', drafts: readLocal() };
    return { mode: 'server', drafts: await res.json() };
  } catch (err) {
    return { mode: 'local', drafts: readLocal() };
  }
}

/**
 * Serialise a draft for download, so authored work is not trapped in the
 * visitor's browser. The Python CLI (scripts/export_skyculture.py) remains
 * the real path to a Stellarium sky culture; this is just the raw draft.
 */
export function draftToJsonBlob(draft) {
  return new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
}

/** Filename for a downloaded draft. Uses the constellation name when there
 *  is one, else the culture key — never invents a name. */
export function draftFilename(draft) {
  const base =
    (draft && typeof draft.name_english === 'string' && draft.name_english.trim()) ||
    (draft && typeof draft.culture_key === 'string' && draft.culture_key.trim()) ||
    'draft';
  return `${base.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '')}.json`;
}
