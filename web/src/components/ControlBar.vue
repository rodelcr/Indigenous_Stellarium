<script setup>
// ControlBar.vue — time and view controls along the bottom of the sky.
//
// Thin wiring only: the arithmetic lives in timeControls.js and the object
// URL lifecycle in horizonImage.js, both unit-tested. Follow that split for
// anything added here.
//
// Engine properties used, all verified in vendor/ source rather than
// assumed:
//   core.time_speed          core.c:1047, simulated seconds per real second
//   core.observer.utc        Modified Julian Date, settable
//   core.landscapes.visible  modules/landscape.c:351
//   core.atmosphere.visible  modules/atmosphere.c:314
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getStel } from '../engine.js';
import {
  dateToMjd, mjdToDate, nextSpeed, formatSpeed, formatUtc,
  toDateTimeLocalValue, fromDateTimeLocalValue, REAL_TIME,
} from '../timeControls.js';
import { createHorizonStore } from '../horizonImage.js';
import LocationPanel from './LocationPanel.vue';

const emit = defineEmits(['horizon-changed']);

const speed = ref(REAL_TIME);
const clock = ref('');
const showDatePicker = ref(false);
const showLocation = ref(false);
const dateValue = ref('');
const groundVisible = ref(false);
const atmosphereVisible = ref(false);
const horizonError = ref(null);
const horizonLoaded = ref(false);
const fileInput = ref(null);

const horizon = createHorizonStore();
let tick = null;

const paused = computed(() => speed.value === 0);
const speedLabel = computed(() => formatSpeed(speed.value));

function withStel(fn) {
  const stel = getStel();
  if (!stel) return;
  fn(stel);
}

/**
 * Set the observer clock. `core.observer.utc` is a plain settable Modified
 * Julian Date property, and writing it is enough — the engine derives tt
 * from it and the per-frame advance picks up from there.
 *
 * (The engine also exports core_set_time(utc, duration), which additionally
 * clears any running time animation. Nothing here starts one, so the plain
 * write is the smaller dependency; reach for that entry point only if this
 * app ever animates time transitions.)
 */
function setEngineTime(stel, date) {
  stel.core.observer.utc = dateToMjd(date);
}

function readEngine() {
  withStel((stel) => {
    speed.value = stel.core.time_speed;
    clock.value = formatUtc(mjdToDate(stel.core.observer.utc));
  });
}

function setSpeed(v) {
  withStel((stel) => {
    stel.core.time_speed = v;
    speed.value = v;
  });
}

function step(direction) {
  setSpeed(nextSpeed(speed.value, direction));
}

// Pause remembers nothing deliberately: resuming goes to real time, which
// is the value someone reaching for "play" almost always wants back.
function togglePause() {
  setSpeed(paused.value ? REAL_TIME : 0);
}

function goNow() {
  withStel((stel) => {
    setEngineTime(stel, new Date());
    stel.core.time_speed = REAL_TIME;
    speed.value = REAL_TIME;
  });
}

function openDatePicker() {
  withStel((stel) => {
    dateValue.value = toDateTimeLocalValue(mjdToDate(stel.core.observer.utc));
    showDatePicker.value = true;
  });
}

function applyDate() {
  const d = fromDateTimeLocalValue(dateValue.value);
  // A malformed value yields null rather than an Invalid Date, so NaN can
  // never reach the engine clock and strand the view at an unrenderable time.
  if (!d) return;
  withStel((stel) => {
    setEngineTime(stel, d);
    showDatePicker.value = false;
  });
}

function toggleGround() {
  withStel((stel) => {
    groundVisible.value = !groundVisible.value;
    stel.core.landscapes.visible = groundVisible.value;
  });
}

function toggleAtmosphere() {
  withStel((stel) => {
    atmosphereVisible.value = !atmosphereVisible.value;
    stel.core.atmosphere.visible = atmosphereVisible.value;
  });
}

function chooseHorizon(event) {
  const file = event.target.files && event.target.files[0];
  const res = horizon.set(file);
  if (res.error) {
    horizonError.value = res.error;
    horizonLoaded.value = false;
  } else {
    horizonError.value = null;
    horizonLoaded.value = true;
  }
  emit('horizon-changed', horizon.url);
  // Let the same file be chosen again after a clear.
  if (event.target) event.target.value = '';
}

function clearHorizon() {
  horizon.clear();
  horizonLoaded.value = false;
  horizonError.value = null;
  emit('horizon-changed', null);
}

onMounted(() => {
  readEngine();
  tick = setInterval(readEngine, 500);
});

onUnmounted(() => {
  if (tick) clearInterval(tick);
  // Releases the panorama's blob; see horizonImage.js.
  horizon.clear();
});
</script>

<template>
  <div class="control-bar">
    <div class="group time-group">
      <button type="button" class="ctl" title="Step backward / rewind faster" @click="step(-1)">◀◀</button>
      <button type="button" class="ctl" :title="paused ? 'Play' : 'Pause'" @click="togglePause">
        {{ paused ? '▶' : '❙❙' }}
      </button>
      <button type="button" class="ctl" title="Step forward / fast forward" @click="step(1)">▶▶</button>
      <button type="button" class="ctl wide" title="Return to the current time" @click="goNow">Now</button>
    </div>

    <div class="group readout">
      <span class="clock">{{ clock }}</span>
      <span class="speed" :class="{ paused }">{{ speedLabel }}</span>
    </div>

    <div class="group">
      <button type="button" class="ctl wide" @click="openDatePicker">Set date…</button>
      <button
        type="button"
        class="ctl wide"
        :class="{ on: showLocation }"
        @click="showLocation = !showLocation"
      >Location…</button>
      <button
        type="button"
        class="ctl wide"
        :class="{ on: groundVisible }"
        :aria-pressed="groundVisible"
        @click="toggleGround"
      >Ground {{ groundVisible ? 'on' : 'off' }}</button>
      <button
        type="button"
        class="ctl wide"
        :class="{ on: atmosphereVisible }"
        :aria-pressed="atmosphereVisible"
        @click="toggleAtmosphere"
      >Sky glow {{ atmosphereVisible ? 'on' : 'off' }}</button>
      <button type="button" class="ctl wide" @click="fileInput.click()">Horizon photo…</button>
      <button v-if="horizonLoaded" type="button" class="ctl wide" @click="clearHorizon">Remove horizon</button>
      <input
        ref="fileInput"
        type="file"
        class="file-input"
        accept="image/jpeg,image/png,image/webp,image/avif"
        @change="chooseHorizon"
      />
    </div>
  </div>

  <div v-if="showDatePicker" class="date-dialog" role="dialog" aria-label="Set observation date">
    <label class="date-label" for="obs-date">Date and time (UTC)</label>
    <input id="obs-date" v-model="dateValue" type="datetime-local" class="date-input" />
    <div class="date-actions">
      <button type="button" class="ctl wide" @click="applyDate">Apply</button>
      <button type="button" class="ctl wide" @click="showDatePicker = false">Cancel</button>
    </div>
  </div>

  <LocationPanel :open="showLocation" @close="showLocation = false" />

  <p v-if="horizonError" class="horizon-error">{{ horizonError }}</p>
</template>

<style scoped>
.control-bar {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  max-width: calc(100vw - 24rem);
  padding: 0.5rem 0.75rem;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius);
  font-family: var(--font-serif);
  font-size: var(--font-size);
  color: var(--text);
}

.group {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.ctl {
  min-width: 2.2rem;
  padding: 0.3rem 0.5rem;
  background: var(--control-bg);
  border: 1px solid var(--control-border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font-serif);
  font-size: var(--font-size);
  cursor: pointer;
}

.ctl.wide { min-width: auto; }
.ctl:hover { background: var(--control-bg-hover); }

/* An engaged toggle reads as a left rule plus brighter text -- the same
   selection language the culture list uses. No fill, no glow. */
.ctl.on {
  border-left: 2px solid var(--accent);
  color: var(--text-bright);
}

.readout {
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  min-width: 15rem;
}

/* The clock is data: monospace, so the digits do not jitter as it ticks. */
.clock {
  font-family: var(--font-mono);
  font-size: var(--font-size-mono);
  color: var(--text-bright);
}

.speed { font-size: 11px; color: var(--text-dim); }
.speed.paused { color: var(--accent); }

.file-input { display: none; }

.date-dialog {
  position: fixed;
  bottom: 5.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius);
  font-family: var(--font-serif);
  color: var(--text);
}

.date-label { font-size: 11px; color: var(--text-dim); }

.date-input {
  padding: 0.3rem 0.5rem;
  background: var(--control-bg);
  border: 1px solid var(--control-border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--font-size-mono);
}

.date-actions { display: flex; gap: 0.35rem; }

.horizon-error {
  position: fixed;
  bottom: 5.5rem;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0.4rem 0.6rem;
  max-width: 32rem;
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  border-radius: var(--radius);
  font-family: var(--font-serif);
  font-size: var(--font-size);
  color: var(--text);
}
</style>
