// engine.js — stellarium-web-engine lifecycle.
//
// This is the ONLY module that talks to the raw engine. Later tasks
// (culture switching, star selection, authoring UI) must go through
// `getStel()` rather than re-initializing or reaching into the WASM
// module directly. Keep this file to boot + visibility defaults only —
// no UI, no culture logic, no selection logic.
//
// Initialization sequence and data-source URLs are copied verbatim from
// the engine repo's own working example,
// vendor/stellarium-web-engine/apps/simple-html/stellarium-web-engine.html
// (read that file before changing anything below) — it is the verified
// ground truth for how this engine wants to be booted.
import { assetUrl } from './assetUrl.js';

// Resolved against the deployment base (see assetUrl.js) so a GitHub
// Pages project subpath works without changing anything in dev.
const ENGINE_JS_URL = assetUrl('/engine/stellarium-web-engine.js');
const ENGINE_WASM_URL = assetUrl('/engine/stellarium-web-engine.wasm');
const SKYDATA_BASE_URL = assetUrl('/skydata') + '/';

let stelInstance = null;
let loadEnginePromise = null;

// StelWebEngine() is emitted by Emscripten as a classic (non-module)
// global, so it must be loaded via a plain <script> tag rather than
// `import`.
function loadEngineScript() {
  if (loadEnginePromise) return loadEnginePromise;
  loadEnginePromise = new Promise((resolve, reject) => {
    if (window.StelWebEngine) {
      resolve(window.StelWebEngine);
      return;
    }
    const script = document.createElement('script');
    script.src = ENGINE_JS_URL;
    script.onload = () => resolve(window.StelWebEngine);
    script.onerror = () => reject(new Error(`Failed to load ${ENGINE_JS_URL}`));
    document.head.appendChild(script);
  });
  return loadEnginePromise;
}

function addDataSources(stel) {
  // Mirrors apps/simple-html/stellarium-web-engine.html's onReady data
  // source setup exactly (same keys, same relative layout under
  // test-skydata/), just pointed at our /skydata/ static mount instead
  // of a path relative to the demo page.
  const core = stel.core;
  const base = SKYDATA_BASE_URL;

  core.stars.addDataSource({ url: base + 'stars' });
  core.skycultures.addDataSource({ url: base + 'skycultures/western', key: 'western' });
  core.dsos.addDataSource({ url: base + 'dso' });
  core.landscapes.addDataSource({ url: base + 'landscapes/guereins', key: 'guereins' });
  core.milkyway.addDataSource({ url: base + 'surveys/milkyway' });
  core.minor_planets.addDataSource({ url: base + 'mpcorb.dat', key: 'mpc_asteroids' });
  core.planets.addDataSource({ url: base + 'surveys/sso/moon', key: 'moon' });
  core.planets.addDataSource({ url: base + 'surveys/sso/sun', key: 'sun' });
  core.planets.addDataSource({ url: base + 'surveys/sso/moon', key: 'default' });
  core.comets.addDataSource({ url: base + 'CometEls.txt', key: 'mpc_comets' });
  core.satellites.addDataSource({ url: base + 'tle_satellite.jsonl.gz', key: 'jsonl/sat' });
}

function setInitialVisibility(stel) {
  const core = stel.core;

  // Task 1 found the engine's *default* atmosphere/landscape rendering
  // occludes the sky (a lit "daytime" atmosphere + opaque ground horizon
  // drawn over the stars), so a naive boot shows a blank/dark canvas.
  // Turn both off explicitly so the star field is visible on first load.
  core.atmosphere.visible = false;
  core.landscapes.visible = false;

  // Product requirement: Western/IAU constellations are OFF by default
  // (indigenous constellations are first-class; Western figuring is
  // opt-in). Explicitly clear all three renderings — lines, labels, and
  // constellation-art images — not just lines, so nothing Western draws
  // on first load even though the `western` sky culture data source is
  // loaded (later tasks need it loaded, just not shown).
  core.constellations.lines_visible = false;
  core.constellations.labels_visible = false;
  core.constellations.images_visible = false;

  // Upstream draws ONLY the constellation under the centre of the view and
  // hides every other one, so figures popped in and out as you panned and
  // the sky read as empty anywhere but the middle. Our engine patch
  // (scripts/constellation-dimming.patch) turns that flag into an emphasis
  // control instead: everything in view is drawn, the pointed one at full
  // strength and the rest at `unpointed_dim`, easing between the two.
  //
  // Kept ON deliberately — with it off, every figure draws at equal weight
  // and a busy sky becomes hard to read. The point is emphasis, not
  // all-or-nothing.
  core.constellations.show_only_pointed = true;
  core.constellations.unpointed_dim = 0.35;

  // The bundled TLE set is from the engine's 2021-era demo data, so every
  // satellite is propagated from elements years out of date — the console
  // fills with "Satellite position error" on boot and the positions drawn
  // are wrong. Showing wrong positions is worse than showing none; the Sky
  // layers panel can turn them back on for anyone who wants to look.
  core.satellites.visible = false;
}

/**
 * Boot the engine into `canvas` and resolve with the initialized `stel`
 * instance once onReady fires. Safe to call once per app lifetime.
 */
export function initEngine(canvas) {
  return loadEngineScript().then(
    (StelWebEngine) =>
      new Promise((resolve, reject) => {
        if (!StelWebEngine) {
          reject(new Error('StelWebEngine global not found after loading engine script'));
          return;
        }
        StelWebEngine({
          wasmFile: ENGINE_WASM_URL,
          canvas,
          // No i18next wired up here (this is the project's own shell,
          // not the demo page) — pass strings through untranslated
          // rather than pulling in an external CDN dependency.
          translateFn: (domain, str) => str,
          onReady: (stel) => {
            // addDataSources/setInitialVisibility touch stel.core.* and
            // can throw (e.g. a module missing/renamed after a future
            // engine rebuild). Without this try/catch, a throw here
            // would skip resolve() entirely and leave the promise
            // pending forever — App.vue's `await initEngine(...)` would
            // hang with no error banner, exactly the silent-blank-canvas
            // failure mode this task is meant to prevent.
            try {
              stelInstance = stel;
              addDataSources(stel);
              setInitialVisibility(stel);
              // Dev-only handle. The engine is deliberately module-private
              // (everything goes through getStel()), which also makes it
              // unreachable from a browser console — so diagnosing "does
              // this constellation render where the catalogue says it
              // should?" meant guessing from screenshots. Never exposed in
              // a production build.
              if (import.meta.env.DEV) globalThis.__stel = stel;
              resolve(stel);
            } catch (err) {
              reject(err);
            }
          },
        });
      })
  );
}

/** The initialized engine instance, or null/undefined before initEngine() resolves. */
export function getStel() {
  return stelInstance;
}
