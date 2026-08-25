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
import {
  readStarModelData, temperatureFromBV, formatTemperature, colourFromBV,
  parseSpectralType, describeMultiplicity, formatDsoDimensions,
  BV_TEMPERATURE_SOURCE,
} from '../starPhysical.js';

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

// --- pedagogical layer -----------------------------------------------
// Each of these is null whenever the catalogue does not carry the input.
// Nothing here fills a gap with a plausible value.

const model = computed(() =>
  selection.value ? readStarModelData(selection.value.jsonData) : {}
);

const colour = computed(() => colourFromBV(model.value.bv));

const temperature = computed(() =>
  formatTemperature(temperatureFromBV(model.value.bv))
);

const spectral = computed(() => parseSpectralType(model.value.spectralType));

const multiplicity = computed(() =>
  selection.value ? describeMultiplicity(selection.value.type) : null
);

const dsoSize = computed(() => formatDsoDimensions(model.value.dimX, model.value.dimY));

const morphology = computed(() => model.value.morphology);

/** One plain sentence describing the star's class, built only from parts the
 *  catalogue supplied. Reads as teaching rather than a data dump. */
const spectralSentence = computed(() => {
  const s = spectral.value;
  if (!s) return null;
  const bits = [];
  if (s.classDescription) bits.push(s.classDescription);
  if (s.luminosityDescription) bits.push(s.luminosityDescription);
  return bits.length ? bits.join(', ') : null;
});

const temperatureSource = BV_TEMPERATURE_SOURCE;

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

    <p v-if="colour" class="colour">
      <span class="swatch" :style="{ background: colour.swatch }" aria-hidden="true"></span>
      {{ colour.name }}
      <span v-if="spectral" class="spectral">{{ spectral.raw }}</span>
    </p>
    <p v-if="spectralSentence" class="teaching">{{ spectralSentence }}</p>
    <p v-if="multiplicity" class="teaching">{{ multiplicity.label }}</p>

    <dl v-if="magnitude || distance || angularSize || phase || temperature || dsoSize || morphology" class="facts">
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
      <template v-if="temperature">
        <dt>Temperature</dt><dd>{{ temperature }}<span class="est">est.</span></dd>
      </template>
      <template v-if="dsoSize">
        <dt>Size</dt><dd>{{ dsoSize }}</dd>
      </template>
      <template v-if="morphology">
        <dt>Morphology</dt><dd>{{ morphology }}</dd>
      </template>
    </dl>

    <!-- The temperature is derived, not measured. Saying so beside it is the
         difference between teaching and asserting. -->
    <p v-if="temperature" class="provenance">{{ temperatureSource }}</p>

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

.colour { display: flex; align-items: center; gap: 0.4rem; margin: 0.4rem 0 0; }

.swatch {
  width: 0.7rem;
  height: 0.7rem;
  border: 1px solid var(--panel-border);
  /* Square, like everything else here. */
  border-radius: 0;
  flex: none;
}

.spectral {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
}

.teaching { margin: 0.25rem 0 0; font-size: 11px; line-height: 1.4; color: var(--text-dim); }

.est { margin-left: 0.3rem; font-family: var(--font-serif); font-size: 10px; color: var(--text-dim); }

.provenance {
  margin: 0.4rem 0 0;
  font-size: 10px;
  line-height: 1.35;
  color: var(--text-dim);
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
