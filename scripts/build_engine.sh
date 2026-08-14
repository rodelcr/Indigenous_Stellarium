#!/usr/bin/env bash
#
# build_engine.sh — compile stellarium-web-engine (C -> WebAssembly) and
# stage its build artifacts for the frontend to consume.
#
# STAGING-DIR RATIONALE (read this before changing the output paths):
# Task 1 (this script) runs before Task 2 scaffolds the `web/` Vite app.
# `npm create vite@latest web` refuses to run against a pre-existing,
# non-empty `web/` directory, so this script must NOT create
# `web/public/engine/` or `web/public/skydata/` itself. Instead it stages
# everything under `build-artifacts/` at the repo root:
#   build-artifacts/engine/stellarium-web-engine.js
#   build-artifacts/engine/stellarium-web-engine.wasm
#   build-artifacts/skydata/            (copy of apps/test-skydata/)
# Task 2's implementer moves/copies these into `web/public/engine/` and
# `web/public/skydata/` once that directory exists. This script is safe to
# re-run at any point (idempotent) — later tasks can re-run it after Task 2
# lands and copy straight into `web/public/` themselves if preferred.
#
# Requires `emcc` (Emscripten) and `scons` on PATH. This script does NOT
# install them — install with `brew install emscripten scons` if missing.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${REPO_ROOT}/vendor/stellarium-web-engine"
STAGING_DIR="${REPO_ROOT}/build-artifacts"
ENGINE_OUT="${STAGING_DIR}/engine"
SKYDATA_OUT="${STAGING_DIR}/skydata"
ENGINE_REPO_URL="https://github.com/Stellarium/stellarium-web-engine"

echo "==> [1/7] Checking toolchain (emcc, scons)"
if ! command -v emcc >/dev/null 2>&1; then
  echo "ERROR: emcc (Emscripten) not found on PATH. Install with: brew install emscripten" >&2
  exit 1
fi
if ! command -v scons >/dev/null 2>&1; then
  echo "ERROR: scons not found on PATH. Install with: brew install scons" >&2
  exit 1
fi
echo "    emcc:  $(emcc --version | head -1)"
echo "    scons: $(scons --version | sed -n '2p')"

echo "==> [2/7] Fetching stellarium-web-engine into vendor/"
if [ -d "${VENDOR_DIR}/.git" ]; then
  echo "    vendor/stellarium-web-engine already present — skipping clone"
else
  mkdir -p "${REPO_ROOT}/vendor"
  git clone "${ENGINE_REPO_URL}" "${VENDOR_DIR}"
fi

# The engine's SConstruct is from ~Dec 2021 and does not build cleanly
# against a 2026-era Emscripten toolchain. scripts/engine-emscripten6-compat.patch
# fixes (documented inline in the patch itself):
#   1. SCons doesn't propagate the shell's PATH to subprocess tools by
#      default, so emcc's python3 entry point can resolve to macOS's
#      ancient bundled /usr/bin/python3 (3.9.x) instead of a >=3.10
#      interpreter, which modern Emscripten requires.
#   2. `EXTRA_EXPORTED_RUNTIME_METHODS` was removed; replaced with
#      `EXPORTED_RUNTIME_METHODS`.
#   3. `ALLOC_NORMAL`/`allocate` (legacy Emscripten runtime helpers) are
#      gone entirely; unused by this engine's JS glue, so just dropped.
#      `_malloc`/`_free` (which ARE used) now need to be exported via
#      `EXPORTED_FUNCTIONS` rather than `EXPORTED_RUNTIME_METHODS`.
#   4. Newer Clang turns several 2021-era-harmless warnings into hard
#      errors under this project's default `werror=1`: linker `-s`
#      settings echoed during `-c` compile steps, K&R-style function
#      definitions in vendored zlib, and one unused-but-set-variable in
#      src/modules/comets.c. All three are suppressed via -Wno- flags
#      rather than hand-editing vendored/engine source.
echo "==> [3/7] Patching vendor/ SConstruct for Emscripten 6.x compatibility"
BUILD_PATCH_FILE="${REPO_ROOT}/scripts/engine-emscripten6-compat.patch"
if grep -q "patched by indigenous-stellarium" "${VENDOR_DIR}/SConstruct" 2>/dev/null; then
  echo "    already patched — skipping"
else
  (cd "${VENDOR_DIR}" && git apply "${BUILD_PATCH_FILE}")
  echo "    applied ${BUILD_PATCH_FILE}"
fi

# apps/simple-html/stellarium-web-engine.html is the engine repo's own
# minimal demo page (used for the Step 4 browser smoke test — see
# apps/simple-html/README.md). It has two long-standing bugs unrelated to
# our Emscripten version fixes above, which we hit while smoke-testing this
# build: (a) a missing closing brace inside the onReady callback's
# stel.change() handler, a genuine syntax error in the upstream file that
# breaks the entire <script> block; (b) unpinned `vue`/`vuetify` CDN script
# tags that resolve to today's latest major versions (Vue 3 / Vuetify 3),
# incompatible with this Vue-2-era page's `new Vue()` / `new Vuetify()`
# calls — while the adjacent vuetify@2.x CSS `<link>` was already pinned.
# Patching so the smoke test (and anyone else who reaches for this demo
# page) works out of the box.
echo "==> [4/7] Patching apps/simple-html/ demo page for the smoke test"
DEMO_PATCH_FILE="${REPO_ROOT}/scripts/engine-demo-page-fixes.patch"
if grep -q "vue@2/dist/vue.js" "${VENDOR_DIR}/apps/simple-html/stellarium-web-engine.html" 2>/dev/null; then
  echo "    already patched — skipping"
else
  (cd "${VENDOR_DIR}" && git apply "${DEMO_PATCH_FILE}")
  echo "    applied ${DEMO_PATCH_FILE}"
fi

echo "==> [5/7] Building engine WASM (make js)"
(
  cd "${VENDOR_DIR}"
  make js
)

echo "==> [6/7] Staging build/stellarium-web-engine.{js,wasm} -> build-artifacts/engine/"
mkdir -p "${ENGINE_OUT}"
BUILT_JS="${VENDOR_DIR}/build/stellarium-web-engine.js"
BUILT_WASM="${VENDOR_DIR}/build/stellarium-web-engine.wasm"
if [ ! -f "${BUILT_JS}" ] || [ ! -f "${BUILT_WASM}" ]; then
  echo "ERROR: expected build outputs not found:" >&2
  echo "  ${BUILT_JS}" >&2
  echo "  ${BUILT_WASM}" >&2
  exit 1
fi
cp "${BUILT_JS}" "${ENGINE_OUT}/stellarium-web-engine.js"
cp "${BUILT_WASM}" "${ENGINE_OUT}/stellarium-web-engine.wasm"

echo "==> [7/7] Staging apps/test-skydata/ -> build-artifacts/skydata/"
rm -rf "${SKYDATA_OUT}"
cp -R "${VENDOR_DIR}/apps/test-skydata" "${SKYDATA_OUT}"

echo "==> Done."
echo "    Engine JS/WASM: ${ENGINE_OUT}"
echo "    Skydata:        ${SKYDATA_OUT}"
