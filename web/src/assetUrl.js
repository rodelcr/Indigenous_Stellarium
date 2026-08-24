// assetUrl.js — resolve a repo-root-relative asset path against the base
// path the app is actually deployed under.
//
// Why this exists: every static asset in this app (the engine .js/.wasm,
// the bundled skydata, each sky culture's index.json, taxonomy.json,
// attribution.json) was originally referenced with a leading-slash
// absolute path like '/engine/stellarium-web-engine.wasm'. That works
// only when the app is served from a domain root. GitHub Pages serves
// project sites from a SUBPATH -- https://<user>.github.io/<repo>/ --
// where '/engine/...' resolves to the user's site root and 404s, taking
// the whole viewer down with it.
//
// Vite exposes the configured base path as import.meta.env.BASE_URL,
// which is '/' in dev and during tests, and '/<repo>/' in a Pages
// build (see vite.config.js). Routing every asset reference through
// assetUrl() therefore changes nothing locally while making the
// deployed build correct.
//
// This is deliberately a tiny pure function rather than an inline
// template string at each call site: the failure mode it prevents
// (double slashes, a missing separator, a path that silently works in
// dev and 404s only in production) is exactly the kind that unit tests
// catch and a browser check does not.

/**
 * Join the app's deployment base path with a root-relative asset path.
 *
 * @param {string} path - asset path relative to the app root. Accepted
 *   with or without a leading slash ('engine/x.wasm' and
 *   '/engine/x.wasm' are equivalent), because call sites in this
 *   codebase historically wrote the leading slash.
 * @param {string} [base] - the deployment base. Defaults to Vite's
 *   configured base; injectable for testing.
 * @returns {string} a path safe to pass to fetch() or a <script> src.
 */
export function assetUrl(path, base = import.meta.env.BASE_URL) {
  const b = typeof base === 'string' && base !== '' ? base : '/';
  // Normalise both sides so exactly one slash sits at the join, whether
  // or not the base has a trailing slash and the path a leading one.
  const left = b.endsWith('/') ? b.slice(0, -1) : b;
  const right = path.startsWith('/') ? path : '/' + path;
  return left + right;
}
