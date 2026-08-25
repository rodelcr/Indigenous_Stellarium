<script setup>
// ObjectInfo.vue — what you clicked on.
//
// Replaces the star-only card: onStarSelected() fires only for HIP-bearing
// stars, so clicking a planet, nebula, galaxy or constellation previously
// produced nothing at all. This uses the general onObjectSelected() path.
//
// Nothing here invents a value. Every field is omitted when the engine has
// no answer, rather than shown as "unknown", "—" or 0 — a distance of zero
// beside a star would be a wrong fact, and the engine really does return NaN
// for stars without parallax.
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getStel } from '../engine.js';
import { onObjectSelected } from '../selection.js';
import {
  chooseNames, catalogueDesignations, formatMagnitude, formatDistance,
  formatAngularSize, formatPhase, formatType,
} from '../objectInfo.js';

const selection = ref(null);
let unsubscribe = null;

onMounted(() => {
  unsubscribe = onObjectSelected((payload) => {
    selection.value = payload;
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

const names = computed(() =>
  selection.value
    ? chooseNames(selection.value.designations, selection.value.culturalNames)
    : { primary: null, secondary: null, pronounce: null }
);

const typeLabel = computed(() => {
  if (!selection.value) return null;
  const stel = getStel();
  return formatType(selection.value.type, stel ? stel.otypeToStr : null);
});

const magnitude = computed(() =>
  selection.value ? formatMagnitude(selection.value.vmag) : null
);
const distance = computed(() =>
  selection.value ? formatDistance(selection.value.distance) : null
);
const angularSize = computed(() =>
  selection.value ? formatAngularSize(selection.value.radius) : null
);
const phase = computed(() =>
  selection.value ? formatPhase(selection.value.phase) : null
);
const catalogue = computed(() =>
  selection.value ? catalogueDesignations(selection.value.designations) : []
);

// Cultural names beyond the one used as the primary title — a star can carry
// several in one culture, and dropping them would quietly privilege the first.
const otherCulturalNames = computed(() => {
  if (!selection.value) return [];
  const all = Array.isArray(selection.value.culturalNames) ? selection.value.culturalNames : [];
  return all
    .slice(1)
    .map((c) => c && (c.name_native || c.name_english))
    .filter(Boolean);
});

const hasAnything = computed(() => !!(selection.value && names.value.primary));
</script>

<template>
  <div v-if="hasAnything" class="object-info" role="status" aria-live="polite">
    <h2 class="name">{{ names.primary }}</h2>
    <p v-if="names.pronounce" class="pronounce">{{ names.pronounce }}</p>
    <p v-if="names.secondary" class="secondary">{{ names.secondary }}</p>
    <p v-if="typeLabel" class="type">{{ typeLabel }}</p>

    <dl v-if="magnitude || distance || angularSize || phase" class="facts">
      <template v-if="magnitude">
        <dt>Magnitude</dt><dd>{{ magnitude }}</dd>
      </template>
      <template v-if="distance">
        <dt>Distance</dt><dd>{{ distance }}</dd>
      </template>
      <template v-if="angularSize">
        <dt>Apparent size</dt><dd>{{ angularSize }}</dd>
      </template>
      <template v-if="phase">
        <dt>Phase</dt><dd>{{ phase }}</dd>
      </template>
    </dl>

    <p v-if="otherCulturalNames.length" class="also">
      Also called {{ otherCulturalNames.join(', ') }}
    </p>

    <!-- Catalogue ids last and quiet: they are storage, not what the object
         is called. -->
    <p v-if="catalogue.length" class="catalogue">{{ catalogue.join(' · ') }}</p>
  </div>
</template>

<style scoped>
.object-info {
  position: fixed;
  top: 1rem;
  right: 1rem;
  width: 17rem;
  padding: 0.75rem;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius);
  font-family: var(--font-serif);
  font-size: var(--font-size);
  color: var(--text);
}

.name { margin: 0; font-size: 1.15rem; font-weight: normal; color: var(--text-bright); }
.pronounce { margin: 0.1rem 0 0; font-size: 11px; font-style: italic; color: var(--text-dim); }
.secondary { margin: 0.15rem 0 0; color: var(--text-dim); }
.type { margin: 0.35rem 0 0; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent-dim); }

.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.1rem 0.6rem;
  margin: 0.6rem 0 0;
}

.facts dt { font-size: 11px; color: var(--text-dim); }

.facts dd {
  margin: 0;
  /* Numbers are data: monospace so columns of them line up. */
  font-family: var(--font-mono);
  font-size: var(--font-size-mono);
  color: var(--text);
}

.also { margin: 0.5rem 0 0; font-size: 11px; line-height: 1.4; color: var(--text-dim); }

.catalogue {
  margin: 0.5rem 0 0;
  padding-top: 0.4rem;
  border-top: 1px solid var(--panel-border);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
}
</style>
