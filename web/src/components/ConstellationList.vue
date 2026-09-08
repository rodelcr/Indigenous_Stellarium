<script setup>
// ConstellationList.vue — the figures of the active sky culture, listed so
// you can go to one instead of hunting for it by panning.
//
// This exists because of a report that Osage lines "aren't showing up". They
// were: Ṭa Tha´-bthiⁿ is 2.76° across and Mi-ḳa´-ḳ'e u-ḳi-tha-ç'iⁿ is 31.3
// ARCMINUTES, so at the default ~50° view they were about 30 and 6 pixels
// long. Nothing was broken and nothing was findable. Cultures that record
// small figures need a way in, and the app had none for any culture.
//
// Figures with no recorded outline are listed too, and marked. See
// constellationList.js for why that matters more than it looks.
import { ref, watch } from 'vue';
import { getStel } from '../engine.js';
import { assetUrl } from '../assetUrl.js';
import { listConstellations, displayName, displayGloss } from '../constellationList.js';
import { fovForRadius } from '../skyFraming.js';
import { waitFor } from '../waitForEngine.js';

const props = defineProps({
  cultureId: { type: String, default: null },
});

const entries = ref([]);
const loadError = ref(null);
const activeId = ref(null);

watch(
  () => props.cultureId,
  async (id) => {
    entries.value = [];
    loadError.value = null;
    activeId.value = null;
    if (!id) return;
    try {
      const url = assetUrl('/skycultures/' + id + '/index.json');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      const index = await res.json();
      // Guard against Vite's dev server, which answers ANY unmatched path
      // with 200 + index.html rather than a 404 (see draftAvailability.js,
      // which exists for the same reason). A parsed body is not proof.
      if (!index || !Array.isArray(index.constellations)) {
        throw new Error(`${url}: not a sky culture index`);
      }
      // A slower fetch for a culture the user has since navigated away from
      // must not overwrite the current list.
      if (props.cultureId !== id) return;
      entries.value = listConstellations(index);
    } catch (err) {
      console.error('ConstellationList: failed to load figures', err);
      loadError.value = err;
    }
  },
  { immediate: true },
);

async function goTo(entry) {
  if (!entry.hasLines) return;
  const stel = getStel();
  if (!stel) return;

  // The engine builds a culture's constellation objects on a RENDER FRAME
  // after current_id changes, not synchronously. Clicking a culture and
  // then immediately clicking one of its figures -- the obvious thing to
  // do, and the first thing anyone does -- therefore found nothing and
  // silently did nothing. Wait for the frame instead of giving up on it.
  const obj = await waitFor(() => stel.getObj(entry.id));
  if (!obj) {
    console.warn('ConstellationList: engine has no object for', entry.id);
    return;
  }

  stel.core.selection = obj;
  activeId.value = entry.id;

  // Frame it. Here we always zoom (unlike the passive rule in App.vue) —
  // clicking a figure by name is an unambiguous request to be shown it.
  let radius;
  try {
    radius = obj.getInfo('radius');
  } catch {
    radius = undefined;
  }
  const fov = fovForRadius(radius);
  if (fov) stel.core.fov = fov;
  if (typeof stel.pointAndLock === 'function') stel.pointAndLock(obj, 1);
}
</script>

<template>
  <div v-if="cultureId" class="constellation-list">
    <h3 class="panel-title">Figures</h3>

    <div v-if="loadError" class="panel-error">
      Could not load this culture's figures.
    </div>

    <p v-else-if="!entries.length" class="empty-note">
      No figures recorded for this culture yet.
    </p>

    <ul v-else class="figure-list">
      <li v-for="entry in entries" :key="entry.id">
        <button
          v-if="entry.hasLines"
          type="button"
          class="figure-button"
          :class="{ active: activeId === entry.id }"
          @click="goTo(entry)"
        >
          <span class="figure-name">{{ displayName(entry) }}</span>
          <span v-if="displayGloss(entry)" class="figure-gloss">
            {{ displayGloss(entry) }}
          </span>
        </button>

        <!-- A figure whose name a source records but whose shape it does
             not. It is NOT a broken entry and NOT a placeholder: the
             community named it, and we declined to invent an outline. It
             stays listed, unclickable, and says so. -->
        <div v-else class="figure-nolines">
          <span class="figure-name">{{ displayName(entry) }}</span>
          <span v-if="displayGloss(entry)" class="figure-gloss">
            {{ displayGloss(entry) }}
          </span>
          <span class="nolines-note">name recorded, outline not — nothing to draw</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.constellation-list {
  /* Nested under the active culture's row in the tree, not a panel of its
     own -- the indent is what says "these belong to that culture". */
  margin: 0.35rem 0 0.5rem 0.5rem;
  padding: 0.4rem 0 0.2rem 0.5rem;
  border-left: 1px solid var(--panel-border);
}

.panel-title {
  margin: 0 0 0.4rem;
  font-size: var(--font-size);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.panel-error {
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  padding: 0.4rem;
  border-radius: var(--radius);
}

.empty-note,
.nolines-note {
  color: var(--text-dim);
  font-size: 0.85em;
}

.figure-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.figure-button,
.figure-nolines {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  font: inherit;
  padding: 0.3rem 0.25rem 0.3rem 0.5rem;
  border-radius: var(--radius);
  /* House style: selection is a left rule plus brighter text, never a
     coloured fill. The transparent rule reserves the space so the row does
     not shift by 2px when it becomes active. */
  border-left: 2px solid transparent;
}

.figure-button {
  cursor: pointer;
}

.figure-button:hover {
  background: var(--control-bg-hover);
}

.figure-button.active {
  border-left-color: var(--accent);
  color: var(--text-bright);
}

.figure-nolines {
  color: var(--text-dim);
}

.figure-gloss {
  color: var(--text-dim);
  font-size: 0.85em;
}
</style>
