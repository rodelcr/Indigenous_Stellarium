<script setup>
// App.vue — thin shell that boots the engine into a full-viewport canvas.
// Keep this file thin: Tasks 4-6 add sibling panels (culture picker,
// selection info, authoring UI) here. Engine lifecycle/config lives in
// engine.js; do not grow that logic back into this component.
import { onMounted, ref } from 'vue';
import { initEngine } from './engine.js';
import CulturePanel from './components/CulturePanel.vue';
import StarInfo from './components/StarInfo.vue';

const canvas = ref(null);
const loadError = ref(null);

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
  <!-- culture-selected is not consumed here yet; Task 6's authoring panel
       will listen for it once it's added as a sibling of CulturePanel. -->
  <CulturePanel />
  <StarInfo />
</template>

<style scoped>
.sky-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.load-error {
  position: fixed;
  top: 1rem;
  left: 1rem;
  right: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(120, 0, 0, 0.85);
  color: #fff;
  font: 14px/1.4 system-ui, sans-serif;
  border-radius: 4px;
}
</style>
