#!/usr/bin/env bash
#
# build_engine.sh — compile stellarium-web-engine (C -> WebAssembly) and
# stage its build artifacts for the frontend to consume.
#
# Outputs go directly into the Vite app's public/ dir (Vite serves
# public/ files at the site root as-is, no build step needed for them):
#   web/public/engine/stellarium-web-engine.js
#   web/public/engine/stellarium-web-engine.wasm
#   web/public/skydata/            (copy of apps/test-skydata/)
# (Task 1 originally staged these under a repo-root `build-artifacts/`
# directory because `npm create vite@latest web` refuses to run against
# a pre-existing, non-empty `web/` directory, and `web/` didn't exist
# yet. Task 2 scaffolded `web/` first, so that staging step is no longer
# needed and has been retired.)
#
# Requires `emcc` (Emscripten) and `scons` on PATH. This script does NOT
# install them — install with `brew install emscripten scons` if missing.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${REPO_ROOT}/vendor/stellarium-web-engine"
ENGINE_OUT="${REPO_ROOT}/web/public/engine"
SKYDATA_OUT="${REPO_ROOT}/web/public/skydata"
ENGINE_REPO_URL="https://github.com/Stellarium/stellarium-web-engine"
# Pinned commit. The three patches this script applies match against context
# lines in upstream source; an unpinned clone means a future upstream edit
# near any patched hunk turns a reproducible build into a failed `git apply`
# — or, worse, a build that succeeds against code we never reviewed.
#
# The engine CORE has been dormant since ~Dec 2021, but the repository is
# NOT dormant: this SHA is a dependabot bump dated 2026-08-11. "Nobody
# touches it" was an assumption worth not relying on.
#
# To move the pin deliberately: update this SHA, re-run this script from a
# clean vendor/, and confirm all three patches still apply.
ENGINE_COMMIT="5403e930416f6dc1dbcca08486a045dd8be67f53"

echo "==> [1/8] Checking toolchain (emcc, scons)"
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

echo "==> [2/8] Fetching stellarium-web-engine into vendor/"
if [ -d "${VENDOR_DIR}/.git" ]; then
  echo "    vendor/stellarium-web-engine already present — skipping clone"
elif [ -e "${VENDOR_DIR}" ]; then
  # A directory with no .git is a partial or interrupted prior clone. Say so
  # rather than letting `git clone` fail with a generic "already exists".
  echo "ERROR: ${VENDOR_DIR} exists but is not a git checkout — likely an" >&2
  echo "       interrupted clone. Remove it and re-run this script." >&2
  exit 1
else
  mkdir -p "${REPO_ROOT}/vendor"
  git clone "${ENGINE_REPO_URL}" "${VENDOR_DIR}"
fi

# Check out the pinned commit every run, not only after a fresh clone, so an
# existing vendor/ checkout left on some other revision is corrected rather
# than silently built from.
ACTUAL_COMMIT="$(git -C "${VENDOR_DIR}" rev-parse HEAD)"
if [ "${ACTUAL_COMMIT}" != "${ENGINE_COMMIT}" ]; then
  echo "    checking out pinned commit ${ENGINE_COMMIT:0:12}"
  git -C "${VENDOR_DIR}" fetch --quiet origin "${ENGINE_COMMIT}" 2>/dev/null || \
    git -C "${VENDOR_DIR}" fetch --quiet origin
  # Distinguish the two failure modes. The likely one on an existing machine
  # is NOT a missing object: vendor/ is git-ignored and every prior run left
  # it dirty (the three patches modify SConstruct, src/modules/stars.c and
  # apps/simple-html/... without committing), so git refuses with "local
  # changes would be overwritten". Reporting that as "upstream rewrote
  # history" would send someone to bump ENGINE_COMMIT — moving the pin off
  # the reviewed SHA, which is the one thing this pin exists to prevent.
  if ! git -C "${VENDOR_DIR}" checkout --quiet "${ENGINE_COMMIT}" 2>/dev/null; then
    if ! git -C "${VENDOR_DIR}" cat-file -e "${ENGINE_COMMIT}^{commit}" 2>/dev/null; then
      echo "ERROR: pinned engine commit ${ENGINE_COMMIT} not found upstream." >&2
      echo "       If upstream rewrote history, update ENGINE_COMMIT in this" >&2
      echo "       script DELIBERATELY and re-verify all three patches apply" >&2
      echo "       to a fresh clone (git apply --check) before trusting it." >&2
    else
      echo "ERROR: the commit exists but checkout was refused — vendor/ has" >&2
      echo "       uncommitted changes, almost certainly this script's own" >&2
      echo "       patches from a previous run." >&2
      echo "       Do NOT change ENGINE_COMMIT. Re-clone instead:" >&2
      echo "         rm -rf ${VENDOR_DIR} && $0" >&2
    fi
    exit 1
  fi
fi
echo "    engine at $(git -C "${VENDOR_DIR}" rev-parse --short HEAD) (pinned)"

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
echo "==> [3/8] Patching vendor/ SConstruct for Emscripten 6.x compatibility"
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
echo "==> [4/8] Patching apps/simple-html/ demo page for the smoke test"
DEMO_PATCH_FILE="${REPO_ROOT}/scripts/engine-demo-page-fixes.patch"
if grep -q "vue@2/dist/vue.js" "${VENDOR_DIR}/apps/simple-html/stellarium-web-engine.html" 2>/dev/null; then
  echo "    already patched — skipping"
else
  (cd "${VENDOR_DIR}" && git apply "${DEMO_PATCH_FILE}")
  echo "    applied ${DEMO_PATCH_FILE}"
fi

# star_get_designations() in src/modules/stars.c only emits a "HIP <n>"
# designation for stars that arrived with no other catalog ids at all
# (a fallback baked into on_file_tile_loaded()). Named/bright stars
# have Bayer/proper-name ids and never hit that fallback, so
# obj.designations() had no HIP entry for them even though star->hip
# is parsed and stored -- making stars unreachable by HIP from JS.
# Sky-culture constellation-line data (and the Task 6 constellation
# authoring tool) key on HIP numbers, so this is a hard blocker.
# scripts/hip-designation.patch makes star_get_designations() always
# emit "HIP <n>" when star->hip is set, guarding against a duplicate
# emission in the id-less-star fallback case.
echo "==> [5/8] Patching vendor/ stars.c to expose HIP designations"
HIP_PATCH_FILE="${REPO_ROOT}/scripts/hip-designation.patch"
if grep -q "patched by indigenous-stellarium" "${VENDOR_DIR}/src/modules/stars.c" 2>/dev/null; then
  echo "    already patched — skipping"
else
  (cd "${VENDOR_DIR}" && git apply "${HIP_PATCH_FILE}")
  echo "    applied ${HIP_PATCH_FILE}"
fi

echo "==> [6/8] Building engine WASM (make js)"
(
  cd "${VENDOR_DIR}"
  make js
)

echo "==> [7/8] Staging build/stellarium-web-engine.{js,wasm} -> web/public/engine/"
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

echo "==> [8/8] Staging apps/test-skydata/ -> web/public/skydata/"
rm -rf "${SKYDATA_OUT}"
cp -R "${VENDOR_DIR}/apps/test-skydata" "${SKYDATA_OUT}"

echo "==> Done."
echo "    Engine JS/WASM: ${ENGINE_OUT}"
echo "    Skydata:        ${SKYDATA_OUT}"
