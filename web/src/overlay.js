// overlay.js — absolutely-positioned canvas that draws the in-progress
// constellation polylines on top of the engine's own canvas, each
// animation frame, by projecting each HIP star's sky position to screen
// pixels and tracking pan/zoom every frame (there is no "on pan" event to
// subscribe to instead — the whole engine works this way, see canvas.js's
// own requestAnimationFrame render loop).
//
// PROJECTION MATH — provenance:
//
// The brief pointed at
// vendor/stellarium-web-engine/apps/web-frontend/src/assets/sw_helpers.js
// for "the working projection code" for the selection marker. That file
// was read in full (598 lines, grepped for project/screen/marker/window) —
// it contains NO screen-space projection code at all; the selection marker
// is apparently drawn by the WASM core itself (render_gl.c), not by the
// legacy Vue frontend. That documented pointer was wrong.
//
// Instead this ports the actual math from the C engine, which is not
// exposed to JS as a single callable, so it's reproduced here from source:
//   - vendor/stellarium-web-engine/src/projection.c: project_to_win()
//   - vendor/stellarium-web-engine/src/projections/proj_stereographic.c:
//     the engine's default projection (core.proj = PROJ_STEREOGRAPHIC,
//     confirmed in core.c)
//   - vendor/stellarium-web-engine/src/utils/vec.c: mat4_inf_perspective()
//     (the perspective matrix project_to_win() multiplies through)
//   - vendor/stellarium-web-engine/src/js/canvas.js: confirms core_render()
//     is called with the canvas's CSS-pixel getBoundingClientRect() size
//     (not device pixels) — so all the math below works in CSS pixels, and
//     HiDPI is handled purely as a canvas backing-store/ctx.scale concern.
//
// Worked through by hand (see inline comments) to: given a unit view-space
// direction vector u = (x, y, z) with z = the *backward* axis (matches the
// stereographic klass's own diagram — u=(0,0,1) is the antipodal
// discontinuity, not straight ahead):
//   h = 0.5 * (1 - u.z)
//   x' = u.x / h,  y' = u.y / h
//   fovy2 = 2 * atan(2 * tan(fovY / 4))          [proj_stereographic_init]
//   f = 1 / tan(fovy2 / 2)                        [mat4_inf_perspective]
//   ndcX = (f / aspect) * x',  ndcY = f * y'
//   winX = (ndcX + 1) / 2 * width
//   winY = (1 - ndcY) / 2 * height
// This was NOT empirically screenshot-diffed against engine-native pixel
// coordinates (no such reference exists to diff against); it was verified
// by algebraically tracing project_to_win()'s matrix multiply by hand
// (mat4_mul_vec4's out[i] = sum_j mat[j][i]*v[j] convention, checked
// against vec.h) down to the two-line formula above, and then empirically
// checked in-browser by drawing a real multi-star polyline and confirming
// it visually tracks the actual stars through pan and zoom (see the task
// report for the screenshot).

import { getStel } from './engine.js';

// --- Resolved-star-object cache (review finding #2) -----------------------
//
// `Module['getObj'](name)` (vendor/stellarium-web-engine/src/js/obj.js)
// calls core_search(), which calls module_list_objs(module, NAN, ...) on
// every top-level module — for the stars module that's `stars_list`
// (modules/stars.c), the SAME function `listObjs` uses, and with an even
// less restrictive magnitude filter (NAN) than the maxMag=0 that surfaced
// the intermittent WASM RuntimeError documented in the task report. Before
// this fix, projectHip() called stel.getObj('HIP ' + hip) for every star,
// in every line, TWICE per frame (once for the stroke pass, once for the
// dot pass), at 60fps, for as long as a draft stayed open — making the
// overlay the heaviest consumer of that fragile path in the app.
//
// Fix, two parts:
//  1. Cache the resolved engine object per HIP here, at module scope, so
//     stel.getObj() (the fragile core_search() call) runs once per star
//     per draft, not once per star per frame. A star's HIP->object mapping
//     is stable for the life of the engine, so no time-based invalidation
//     is needed — only "the draft's star set changed" (see pruneStarCache
//     below).
//  2. Each frame, project each star's screen point ONCE and reuse it for
//     both the stroke and dot passes (see frame() below), instead of
//     calling projectHip() twice.
//
// Deliberately a plain module-level Map, NOT a Vue ref: storing a raw WASM
// object in a ref would let Vue's reactivity wrap it in a Proxy, a known
// footgun documented elsewhere in this codebase (AuthoringPanel.vue's
// nameCache note). overlay.js has no Vue import at all and should stay
// that way.
const starObjCache = new Map(); // hip -> engine object (only successful lookups are cached)

// Only caches a successful lookup. A miss is NOT cached — a star that
// fails to resolve (e.g. engine data still loading) should be retried on
// a later frame rather than being permanently stuck as "not found" for
// the rest of the draft, which caching null here would cause.
function resolveStarObj(stel, hip) {
  const cached = starObjCache.get(hip);
  if (cached) return cached;
  const obj = stel.getObj('HIP ' + hip);
  if (obj) starObjCache.set(hip, obj);
  return obj;
}

// Drops any cached entry whose HIP is no longer present in the draft's
// current lines — called once per frame with the frame's own `lines`, so
// undo/clear/pen-up naturally age stale entries out instead of leaking
// them for the life of the page. Cheap: a draft's star count is small
// (tens, not thousands), so building this Set every frame is not a
// meaningful cost next to the WASM calls it's saving.
function pruneStarCache(lines) {
  const active = new Set();
  for (const line of lines) {
    for (const hip of line) active.add(hip);
  }
  for (const hip of starObjCache.keys()) {
    if (!active.has(hip)) starObjCache.delete(hip);
  }
}

function computeFovY(stel, aspect) {
  const fov = stel.core.fov; // radians — flows straight into projection.c math with no unit conversion (TYPE_ANGLE has no get/set conversion in this engine's attribute layer)
  if (aspect < 1) {
    return 4 * Math.atan(Math.tan(fov / 4) / aspect);
  }
  return fov;
}

/**
 * Project a HIP star's current sky position to CSS-pixel screen
 * coordinates, or null if the star can't be found or is behind the camera
 * (the stereographic projection's antipodal discontinuity).
 *
 * @param {object} stel
 * @param {number} hip
 * @param {number} width - canvas CSS width (getBoundingClientRect().width)
 * @param {number} height - canvas CSS height
 * @returns {[number, number]|null}
 */
export function projectHip(stel, hip, width, height) {
  const obj = resolveStarObj(stel, hip);
  if (!obj) return null;

  const radec = obj.getInfo('radec', stel.core.observer);
  if (!radec) return null;

  const view = stel.convertFrame(stel.core.observer, 'ICRF', 'VIEW', radec);
  const norm = Math.hypot(view[0], view[1], view[2]);
  if (norm === 0) return null;
  const ux = view[0] / norm;
  const uy = view[1] / norm;
  const uz = view[2] / norm;

  const h = 0.5 * (1 - uz);
  if (h < 1e-6) return null; // antipodal discontinuity / directly behind camera

  const xPrime = ux / h;
  const yPrime = uy / h;

  const aspect = width / height;
  const fovY = computeFovY(stel, aspect);
  const fovy2 = 2 * Math.atan(2 * Math.tan(fovY / 4));
  const f = 1 / Math.tan(fovy2 / 2);

  const ndcX = (f / aspect) * xPrime;
  const ndcY = f * yPrime;

  return [((ndcX + 1) / 2) * width, ((1 - ndcY) / 2) * height];
}

function resizeCanvasToDisplaySize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const displayWidth = Math.round(rect.width * dpr);
  const displayHeight = Math.round(rect.height * dpr);
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
  return { width: rect.width, height: rect.height, dpr };
}

/**
 * Start drawing `getLines()`'s in-progress polylines (arrays of HIP
 * numbers, e.g. [[1,2,3],[3,4]]) onto `canvas` every animation frame,
 * tracking pan/zoom since there's no discrete "view changed" event to
 * subscribe to instead.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {() => number[][]} getLines
 * @returns {() => void} stop function — cancels the animation frame loop.
 */
export function startOverlay(canvas, getLines) {
  const ctx = canvas.getContext('2d');
  let rafId = null;
  let stopped = false;

  function frame() {
    if (stopped) return;

    const { width, height, dpr } = resizeCanvasToDisplaySize(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const stel = getStel();
    const rawLines = getLines();
    const lines = Array.isArray(rawLines) ? rawLines : [];
    // Age out cache entries for stars no longer in the draft
    // (undo/clear/pen-up) every frame — cheap relative to the WASM calls
    // it saves (see pruneStarCache's doc comment).
    pruneStarCache(lines);

    if (stel && lines.length > 0) {
      ctx.strokeStyle = 'rgba(255, 210, 90, 0.95)';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(255, 210, 90, 0.95)';

      for (const line of lines) {
        // Project each star ONCE per frame and reuse the point for both
        // the stroke pass and the dot pass below (previously projectHip()
        // ran twice per star per frame — this halves the call volume,
        // see the module-level doc comment on starObjCache).
        const points = line.map((hip) => projectHip(stel, hip, width, height));

        let started = false;
        for (const pt of points) {
          if (!pt) {
            started = false; // break the path across an off-screen gap
            continue;
          }
          if (!started) {
            ctx.beginPath();
            ctx.moveTo(pt[0], pt[1]);
            started = true;
          } else {
            ctx.lineTo(pt[0], pt[1]);
          }
        }
        if (started) ctx.stroke();

        // Draw a small dot at each valid vertex, independent of the path
        // above, so single-star (not-yet-connected) lines are still visible.
        for (const pt of points) {
          if (!pt) continue;
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    rafId = window.requestAnimationFrame(frame);
  }

  rafId = window.requestAnimationFrame(frame);

  return function stop() {
    stopped = true;
    if (rafId !== null) window.cancelAnimationFrame(rafId);
  };
}
