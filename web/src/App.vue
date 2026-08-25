<script setup>
// App.vue — thin shell that boots the engine into a full-viewport canvas.
// Keep this file thin: Tasks 4-6 add sibling panels (culture picker,
// selection info, authoring UI) here. Engine lifecycle/config lives in
// engine.js; do not grow that logic back into this component.
import { onMounted, ref } from 'vue';
import { initEngine } from './engine.js';
import CulturePanel from './components/CulturePanel.vue';
import StarInfo from './components/StarInfo.vue';
import AuthoringPanel from './components/AuthoringPanel.vue';
import InfoPanel from './components/InfoPanel.vue';

const canvas = ref(null);
const loadError = ref(null);
// The taxonomy node id of the currently selected culture (including
// placeholder nodes), or null before anything is selected. Just passed
// straight through to AuthoringPanel — App.vue does not interpret it.
const selectedCultureKey = ref(null);

onMounted(async () => {
  try {
    await initEngine(canvas.value);
  } catch (err) {
    // If the WASM fails to load (bad path, unsupported browser, network
    // failure fetching the .wasm), surface it instead of leaving a
    // silent blank canvas.
    console.error('Failed to initialize stellarium-web-engine:', err);
    loadError.value = err;
  }
});
</script>

<template>
  <canvas ref="canvas" class="sky-canvas"></canvas>
  <div v-if="loadError" class="load-error">
    Failed to load the sky engine. Check the console for details.
  </div>
  <!-- Culture list and authoring panel share one left column. They used to
       be independently position:fixed to the same corner, each allowed to
       grow to the full viewport height, so the authoring panel covered the
       bottom of the culture list and its last entries could not be clicked
       at all -- Western/IAU being last, it was unreachable at ordinary
       window heights. -->
  <div class="left-column">
    <CulturePanel @culture-selected="selectedCultureKey = $event" />
    <AuthoringPanel :culture-key="selectedCultureKey" />
  </div>
  <StarInfo />
  <InfoPanel />
</template>

<style scoped>
.sky-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.left-column {
  position: fixed;
  top: 1rem;
  bottom: 1rem;
  left: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  /* Wide enough for the wider of the two panels; each sets its own width. */
  width: 320px;
  /* The column itself must not intercept clicks on the sky between panels. */
  pointer-events: none;
}

.left-column > * {
  pointer-events: auto;
}

.load-error {
  position: fixed;
  top: 1rem;
  left: 1rem;
  right: 1rem;
  padding: 0.75rem 1rem;
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  color: var(--text-bright);
  font-family: var(--font-serif);
  font-size: var(--font-size);
  line-height: var(--line-height);
  border-radius: var(--radius);
}
</style>
