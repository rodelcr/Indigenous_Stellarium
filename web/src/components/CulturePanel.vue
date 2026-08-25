<script setup>
// CulturePanel.vue — the culture switcher: a collapsible tree built from
// /taxonomy.json that lets the user choose whose sky they're looking at.
// This is the only place (besides engine.js's boot-time defaults) that
// mutates stel.core.skycultures / stel.core.constellations — App.vue stays
// thin and does not reach into the engine itself.
//
// Design note on the taxonomy id collision: "western" is used as BOTH a
// top-level bucket id and a leaf child id in taxonomy.json. We never build
// a flat id -> node lookup across buckets and children (that's exactly the
// map where the collision would silently pick the wrong node). Instead:
//   - bucket expand/collapse state is keyed by bucket.id (buckets are
//     unique among themselves: polynesian, south_american, ...).
//   - the active/selected node is tracked by object REFERENCE (the exact
//     child object from the parsed taxonomy array), not by id string, so
//     there is no string-keyed namespace where "western" (bucket) and
//     "western" (child) could collide.
//   - the only string key that crosses node types is the culture-selected
//     emit payload, and that's just `child.id` handed to the caller as
//     specified by the task interface — we don't look anything up with it.
import { ref, onMounted } from 'vue';
import { getStel } from '../engine.js';
import { checkDraftAvailable as checkDraftAvailableImpl } from '../draftAvailability.js';
import { assetUrl } from '../assetUrl.js';

const emit = defineEmits(['culture-selected']);

const buckets = ref([]);
const loadError = ref(null);
// Bucket ids are expanded by default so the full tree is visible on first
// load ("panel open") even though no culture is active yet.
const expanded = ref({});
// The currently active child node (object reference — see note above), or
// null when no culture is selected (first-load / stars-only state).
const activeChild = ref(null);

// Placeholder taxonomy nodes (skyculture_id === null) have no official
// dataset, but a contributor may have exported an authored draft to
// web/public/skycultures/<id>/ via scripts/export_skyculture.py (see
// docs/DESIGN.md's Phase 1 round-trip: "authored culture loads back into
// the viewer"). The exported directory is named after the draft's
// culture_key, which for a placeholder IS the taxonomy node id (there is
// no skyculture_id to use instead). This map records, per placeholder
// child id, whether that probe found a draft — keyed by id rather than
// by object reference since it's populated from a plain fetch, not from
// the taxonomy walk itself.
const draftAvailable = ref({});

// The actual availability check (including the SPA-fallback-vs-real-
// draft distinction — see its own doc comment) lives in
// draftAvailability.js as a pure, fetch-injectable function so it can be
// unit-tested without mounting this component (no DOM env is configured
// for this project's vitest setup). This wrapper just plumbs the result
// into the component's reactive draftAvailable map.
async function checkDraftAvailable(id) {
  const available = await checkDraftAvailableImpl(id);
  draftAvailable.value = { ...draftAvailable.value, [id]: available };
}

// Sky culture ids that have already been handed to
// stel.core.skycultures.addDataSource(). engine.js loads 'western' once at
// boot (with rendering hidden), so it starts pre-populated to avoid a
// second, redundant addDataSource call for the same key.
const loadedCultureIds = new Set(['western']);

onMounted(async () => {
  try {
    const url = assetUrl('/taxonomy.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const data = await res.json();
    for (const bucket of data) {
      expanded.value[bucket.id] = true;
    }
    buckets.value = data;

    for (const bucket of data) {
      for (const child of bucket.children ?? []) {
        if (child.placeholder) checkDraftAvailable(child.id);
      }
    }
  } catch (err) {
    console.error('CulturePanel: failed to load taxonomy.json', err);
    loadError.value = err;
  }
});

function toggleBucket(bucketId) {
  expanded.value[bucketId] = !expanded.value[bucketId];
}

function selectChild(child) {
  const stel = getStel();
  if (!stel) {
    // Engine hasn't finished booting yet; ignore rather than throwing on
    // a null stel.core. Selecting a culture before the WASM engine is
    // ready is a real (if narrow) race, not a case worth building a
    // loading-state UI around for this task.
    console.warn('CulturePanel: engine not ready yet, ignoring selection of', child.id);
    return;
  }

  const core = stel.core;

  // A placeholder with an exported draft on disk (see draftAvailable /
  // checkDraftAvailable above) loads exactly like a real culture, using
  // the taxonomy id itself as the sky-culture key — placeholders have no
  // skyculture_id, and the export directory is named after the draft's
  // culture_key, which is the taxonomy node id.
  const loadableId =
    child.skyculture_id ||
    (child.placeholder && draftAvailable.value[child.id] ? child.id : null);

  if (loadableId) {
    const id = loadableId;
    if (!loadedCultureIds.has(id)) {
      core.skycultures.addDataSource({ url: assetUrl('/skycultures/' + id), key: id });
      loadedCultureIds.add(id);
    }
    core.skycultures.current_id = id;
    core.constellations.lines_visible = true;
    core.constellations.labels_visible = true;
    // Re-enable star common-name rendering (see placeholder branch below
    // for why this can be off) now that a real culture with data is active.
    core.stars.hints_visible = true;
  } else {
    // Placeholder node: no dataset exists yet, so there is nothing to
    // render. Turn off constellation display rather than leaving a
    // previously-selected culture's lines on screen for a bucket that
    // has no data of its own.
    core.constellations.lines_visible = false;
    core.constellations.labels_visible = false;
    // skycultures.current_id has no "clear" call (the engine only swaps
    // between loaded culture keys — see skycultures.c), so a previously
    // active culture stays "current" internally. That alone would leave
    // its star common names (e.g. Māori "Whanui") rendered right next to
    // this placeholder's "no dataset yet" badge. stars.hints_visible is a
    // separate, independently-registered engine property that gates
    // star_render_name() regardless of current_id, so use it to suppress
    // those stale common names for placeholders.
    core.stars.hints_visible = false;
  }

  activeChild.value = child;
  emit('culture-selected', child.id);
}
</script>

<template>
  <div class="culture-panel">
    <h2 class="panel-title">Sky Cultures</h2>
    <div v-if="loadError" class="panel-error">
      Failed to load culture list. Check the console for details.
    </div>
    <ul class="bucket-list">
      <li v-for="bucket in buckets" :key="bucket.id" class="bucket">
        <button
          type="button"
          class="bucket-header"
          :aria-expanded="!!expanded[bucket.id]"
          @click="toggleBucket(bucket.id)"
        >
          <span class="disclosure">{{ expanded[bucket.id] ? '▾' : '▸' }}</span>
          {{ bucket.label }}
        </button>
        <ul v-show="expanded[bucket.id]" class="child-list">
          <li v-for="child in bucket.children" :key="child.id">
            <!-- A culture this deployment is not permitted to redistribute
                 (deploy/exclusions.json, applied by deploy/filter_taxonomy.py).
                 It stays visible in the tree — quietly deleting a community
                 would hide an unresolved licence question — but it is not
                 interactive, because there is nothing here to show and it is
                 not an invitation to contribute either. The reason is stated
                 verbatim rather than dressed up as "no dataset yet", which
                 would wrongly imply the community has no recorded sky
                 knowledge. It does; we lack permission to republish it. -->
            <div v-if="child.excluded" class="child-excluded">
              <span class="child-label">{{ child.label }}</span>
              <span v-if="child.region" class="child-region">{{ child.region }}</span>
              <span class="excluded-note">{{ child.exclusion_reason }}</span>
            </div>
            <button
              v-else
              type="button"
              class="child-button"
              :class="{
                active: activeChild === child,
                placeholder: child.placeholder,
              }"
              @click="selectChild(child)"
            >
              <span class="child-label">{{ child.label }}</span>
              <span v-if="child.region" class="child-region">{{ child.region }}</span>
              <span
                v-if="child.placeholder && draftAvailable[child.id]"
                class="draft-badge"
              >
                draft available — view
              </span>
              <span v-else-if="child.placeholder" class="placeholder-badge">
                no dataset yet — help us build it
              </span>
            </button>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.culture-panel {
  position: fixed;
  top: 1rem;
  left: 1rem;
  width: 280px;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--text);
  border-radius: var(--radius);
  padding: 0.75rem;
  font-family: var(--font-serif);
  font-size: var(--font-size);
  line-height: var(--line-height);
  z-index: 10;
}

.panel-title {
  margin: 0 0 0.5rem;
  font-size: var(--font-size);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.panel-error {
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  padding: 0.5rem;
  border-radius: var(--radius);
  margin-bottom: 0.5rem;
}

.bucket-list,
.child-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.bucket + .bucket {
  margin-top: 0.25rem;
}

.bucket-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  font: inherit;
  font-weight: 700;
  padding: 0.35rem 0.25rem;
  cursor: pointer;
  border-radius: var(--radius);
}

.bucket-header:hover {
  background: var(--control-bg-hover);
}

.disclosure {
  display: inline-block;
  width: 1em;
  color: var(--text-dim);
}

.child-list {
  padding-left: 1.4rem;
}

.child-button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  font: inherit;
  padding: 0.3rem 0.5rem;
  margin: 0.1rem 0;
  cursor: pointer;
  border-radius: var(--radius);
  /* Reserve the gutter the active marker occupies so selecting an entry
     doesn't shift the list sideways. */
  border-left: 2px solid transparent;
}

.child-button:hover {
  background: var(--control-bg-hover);
}

/* Selection is marked, not highlighted: a left rule and brighter text
   rather than a coloured fill block. */
.child-button.active {
  background: var(--control-bg);
  border-left-color: var(--accent);
}

.child-button.active .child-label {
  color: var(--text-bright);
}

.child-label {
  font-weight: 400;
}

.child-region {
  font-size: 11px;
  color: var(--text-dim);
}

/* Placeholder cultures are invitations to contribute, not disabled rows —
   they read at full strength, same as any other entry. */
.child-button.placeholder .child-label {
  color: var(--text);
}

.placeholder-badge {
  margin-top: 0.15rem;
  font-size: 11px;
  color: var(--accent-dim);
}

/* A withheld culture. Same layout as a child button so it sits in the tree
   as an equal entry, but with no interactive affordance — no hover, no
   pointer, no accent. The label keeps full strength: the community is not
   the thing being de-emphasised, the missing permission is. */
.child-excluded {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0.35rem 0.5rem;
  text-align: left;
  cursor: default;
}

.child-excluded .child-label {
  color: var(--text);
}

.excluded-note {
  margin-top: 0.15rem;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-dim);
}

/* Same badge slot as .placeholder-badge, but a placeholder with an
   exported draft is an actionable state (there is something to view), so
   it reads in the full accent colour rather than the dimmed one used for
   the plain "no dataset yet" invitation. Same single accent, no new hue. */
.draft-badge {
  margin-top: 0.15rem;
  font-size: 11px;
  color: var(--accent);
}
</style>
