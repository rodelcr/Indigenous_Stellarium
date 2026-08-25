<script setup>
// LocationPanel.vue — set the observer's position on Earth.
//
// Two equally-weighted paths, deliberately: search a place, or type
// coordinates. The place list is population-ranked, and measured against the
// real GeoNames data that means it omits Ollantaytambo, Pisac and Chinchero
// — the Quechua towns whose sky Yana Phuyu describes — while including Hanga
// Roa only because the 5,000 threshold was chosen over 15,000. A UI that
// treated search as primary and coordinates as an "advanced" fallback would
// work worst for exactly the communities this project is built for.
//
// The list is fetched on first open, not at boot: it is ~3 MB, and a viewer
// who never changes location should not pay for it.
import { ref, computed, watch } from 'vue';
import { getStel } from '../engine.js';
import { assetUrl } from '../assetUrl.js';
import {
  searchPlaces, formatPlace, parseCoordinate, validateLatLon,
  formatLatLon, degToRad, radToDeg,
} from '../cityIndex.js';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close']);

const places = ref(null);
const loading = ref(false);
const loadError = ref(null);
const attribution = ref('');
const query = ref('');
const latText = ref('');
const lonText = ref('');
const coordError = ref(null);
const current = ref('');
const geoBusy = ref(false);
const geoError = ref(null);

const results = computed(() =>
  places.value ? searchPlaces(places.value, query.value) : []
);

function readCurrent() {
  const stel = getStel();
  if (!stel) return;
  const lat = radToDeg(stel.core.observer.latitude);
  const lon = radToDeg(stel.core.observer.longitude);
  current.value = formatLatLon(lat, lon);
  latText.value = lat.toFixed(4);
  lonText.value = lon.toFixed(4);
}

async function loadPlaces() {
  if (places.value || loading.value) return;
  loading.value = true;
  loadError.value = null;
  try {
    const res = await fetch(assetUrl('/cities.json'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    places.value = data.places;
    attribution.value = data.attribution || '';
  } catch (err) {
    // Coordinate entry still works without the list, so this is a degraded
    // state rather than a broken panel — say which.
    loadError.value = 'Could not load the place list. You can still enter coordinates.';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    readCurrent();
    loadPlaces();
  },
  { immediate: true }
);

function applyLatLon(lat, lon) {
  const stel = getStel();
  if (!stel) return;
  // The engine's observer angles are RADIANS (observer.c:339-340).
  stel.core.observer.latitude = degToRad(lat);
  stel.core.observer.longitude = degToRad(lon);
  readCurrent();
}

function choosePlace(p) {
  applyLatLon(p.lat, p.lon);
  query.value = '';
  coordError.value = null;
  emit('close');
}

function applyTypedCoordinates() {
  const lat = parseCoordinate(latText.value);
  const lon = parseCoordinate(lonText.value);
  const problem = validateLatLon(lat, lon);
  if (problem) {
    coordError.value = problem;
    return;
  }
  coordError.value = null;
  applyLatLon(lat, lon);
  emit('close');
}

function useMyLocation() {
  geoError.value = null;
  if (!navigator.geolocation) {
    geoError.value = 'This browser does not offer location access.';
    return;
  }
  geoBusy.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      geoBusy.value = false;
      applyLatLon(pos.coords.latitude, pos.coords.longitude);
      emit('close');
    },
    (err) => {
      geoBusy.value = false;
      geoError.value =
        err.code === 1
          ? 'Location access was declined.'
          : 'Could not get a location from this device.';
    },
    { timeout: 10000 }
  );
}
</script>

<template>
  <div v-if="open" class="location-panel" role="dialog" aria-label="Set observer location">
    <div class="head">
      <h2 class="panel-title">Observer location</h2>
      <button type="button" class="ctl" @click="emit('close')">Close</button>
    </div>

    <p class="current">Currently at {{ current }}</p>

    <section class="section">
      <label class="field-label" for="place-search">Find a place</label>
      <input
        id="place-search"
        v-model="query"
        type="search"
        class="text-input"
        placeholder="Cusco, Hanga Roa, Suva…"
        autocomplete="off"
      />
      <p v-if="loading" class="note">Loading place list…</p>
      <p v-if="loadError" class="note error">{{ loadError }}</p>
      <ul v-if="results.length" class="results">
        <li v-for="(p, i) in results" :key="i">
          <button type="button" class="result" @click="choosePlace(p)">
            <span class="result-name">{{ formatPlace(p) }}</span>
            <span class="result-coords">{{ formatLatLon(p.lat, p.lon) }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="query && places && !loading" class="note">
        No match in the list. Many places are not in it — enter coordinates below.
      </p>
      <!-- Stated plainly rather than left for someone to discover when their
           own town is missing. -->
      <p class="note">
        The list covers populated places above about 5,000 people. Many
        communities are not in it; coordinates reach anywhere.
      </p>
    </section>

    <section class="section">
      <label class="field-label">Or enter coordinates</label>
      <div class="coord-row">
        <input v-model="latText" class="text-input coord" placeholder="Latitude" aria-label="Latitude" />
        <input v-model="lonText" class="text-input coord" placeholder="Longitude" aria-label="Longitude" />
        <button type="button" class="ctl" @click="applyTypedCoordinates">Go</button>
      </div>
      <p class="note">Decimal degrees. “27.15 S” and “−27.15” both work.</p>
      <p v-if="coordError" class="note error">{{ coordError }}</p>
    </section>

    <section class="section">
      <button type="button" class="ctl" :disabled="geoBusy" @click="useMyLocation">
        {{ geoBusy ? 'Asking…' : 'Use my device location' }}
      </button>
      <p v-if="geoError" class="note error">{{ geoError }}</p>
      <p class="note">Your device decides whether to share this. It stays in this browser.</p>
    </section>

    <p v-if="attribution" class="attribution">Place names: {{ attribution }}</p>
  </div>
</template>

<style scoped>
.location-panel {
  position: fixed;
  bottom: 5.5rem;
  left: 50%;
  transform: translateX(-50%);
  width: min(30rem, calc(100vw - 3rem));
  max-height: 60vh;
  overflow-y: auto;
  padding: 0.75rem;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius);
  font-family: var(--font-serif);
  font-size: var(--font-size);
  color: var(--text);
}

.head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }

.panel-title {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.current {
  margin: 0.35rem 0 0.75rem;
  font-family: var(--font-mono);
  font-size: var(--font-size-mono);
  color: var(--text-bright);
}

.section { margin-bottom: 0.9rem; }
.field-label { display: block; margin-bottom: 0.25rem; font-size: 11px; color: var(--text-dim); }

.text-input {
  width: 100%;
  padding: 0.3rem 0.5rem;
  background: var(--control-bg);
  border: 1px solid var(--control-border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font-serif);
  font-size: var(--font-size);
}

.coord-row { display: flex; gap: 0.35rem; }
.coord { font-family: var(--font-mono); font-size: var(--font-size-mono); }

.ctl {
  padding: 0.3rem 0.6rem;
  background: var(--control-bg);
  border: 1px solid var(--control-border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font-serif);
  font-size: var(--font-size);
  cursor: pointer;
  white-space: nowrap;
}
.ctl:hover { background: var(--control-bg-hover); }
.ctl:disabled { opacity: 0.6; cursor: default; }

.results { list-style: none; margin: 0.4rem 0 0; padding: 0; }

.result {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0.3rem 0.4rem;
  background: none;
  border: none;
  border-left: 2px solid transparent;
  color: var(--text);
  font-family: var(--font-serif);
  font-size: var(--font-size);
  text-align: left;
  cursor: pointer;
}

.result:hover { border-left-color: var(--accent); background: var(--control-bg); }
.result-name { color: var(--text); }

.result-coords {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
}

.note { margin: 0.3rem 0 0; font-size: 11px; line-height: 1.4; color: var(--text-dim); }
.note.error { color: var(--accent); }

.attribution {
  margin: 0.5rem 0 0;
  padding-top: 0.5rem;
  border-top: 1px solid var(--panel-border);
  font-size: 11px;
  color: var(--text-dim);
}
</style>
