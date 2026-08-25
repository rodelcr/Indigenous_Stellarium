<script setup>
// StarInfo.vue — shows identity for the currently selected star.
//
// Cultural integrity: every string rendered here comes straight from
// the engine's designations()/culturalDesignations() for the active
// sky culture. Nothing here is invented, translated, or substituted —
// when a culture has no native name for a star, this card simply
// omits that section rather than filling it with a Western/Bayer
// name. Selection logic itself lives in selection.js, not here.
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { onStarSelected, onSelectionCleared } from '../selection.js';

const selected = ref(null);
let unsubscribe = null;
let unsubscribeCleared = null;

onMounted(() => {
  unsubscribe = onStarSelected((payload) => {
    selected.value = payload;
  });
  // Without this, the card kept showing the previously-selected star's
  // identity indefinitely after the user clicked empty sky, a planet,
  // or a DSO — onStarSelected() correctly never fires for those, but
  // nothing else ever reset `selected`. See onSelectionCleared()'s
  // doc comment in selection.js.
  unsubscribeCleared = onSelectionCleared(() => {
    selected.value = null;
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
  if (unsubscribeCleared) unsubscribeCleared();
});

// obj.culturalDesignations() returns an ARRAY of name entries (verified
// against the engine source, vendor/stellarium-web-engine/src/js/obj.js:
// "Return an array of objects with attributes: 'name_native',
// 'name_english', 'name_pronounce', ...") — not a single object. A star
// can carry more than one alternate name entry for the active culture;
// we show the first one the engine gives us rather than picking among
// them ourselves.
const primaryName = computed(() => {
  const names = selected.value && selected.value.culturalNames;
  return Array.isArray(names) && names.length > 0 ? names[0] : null;
});
</script>

<template>
  <div v-if="selected" class="star-info">
    <template v-if="primaryName && primaryName.name_native">
      <h2 class="star-name">{{ primaryName.name_native }}</h2>
      <p v-if="primaryName.name_pronounce" class="star-pronounce">
        {{ primaryName.name_pronounce }}
      </p>
      <p v-if="primaryName.name_english" class="star-gloss">
        {{ primaryName.name_english }}
      </p>
      <p class="star-hip">HIP {{ selected.hip }}</p>
    </template>
    <template v-else>
      <h2 class="star-name">HIP {{ selected.hip }}</h2>
      <p v-if="primaryName && primaryName.name_english" class="star-gloss">
        {{ primaryName.name_english }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.star-info {
  position: fixed;
  top: 1rem;
  right: 1rem;
  width: 240px;
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

/* The name the culture uses is the headline. Size and weight carry that,
   not colour — a coloured highlight would compete with the sky. */
.star-name {
  margin: 0 0 0.2rem;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-bright);
}

.star-pronounce {
  margin: 0 0 0.2rem;
  color: var(--text-dim);
}

.star-gloss {
  margin: 0 0 0.35rem;
  color: var(--text);
}

/* Catalog number: present for provenance, deliberately the quietest thing
   in the panel. */
.star-hip {
  margin: 0;
  /* Monospace: this is a catalogue identifier, not a name. The typeface
     difference is the point — it marks the string as machine data next to
     the human name above it. */
  font-family: var(--font-mono);
  font-size: var(--font-size-mono);
  color: var(--text-dim);
}
</style>
