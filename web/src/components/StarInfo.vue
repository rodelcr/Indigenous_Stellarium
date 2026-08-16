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
import { onStarSelected } from '../selection.js';

const selected = ref(null);
let unsubscribe = null;

onMounted(() => {
  unsubscribe = onStarSelected((payload) => {
    selected.value = payload;
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
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
  background: rgba(15, 15, 25, 0.85);
  color: #eee;
  border-radius: 6px;
  padding: 0.75rem;
  font: 13px/1.4 system-ui, sans-serif;
  z-index: 10;
}

.star-name {
  margin: 0 0 0.2rem;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.star-pronounce {
  margin: 0 0 0.2rem;
  font-style: italic;
  color: #bbb;
}

.star-gloss {
  margin: 0 0 0.35rem;
  color: #ccc;
}

.star-hip {
  margin: 0;
  font-size: 11px;
  color: #999;
}
</style>
