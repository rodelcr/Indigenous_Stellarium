<script setup>
// SkyLayersPanel.vue — the engine's view toggles, grouped.
//
// Rendering is driven entirely by the table in skyLayers.js; there is no
// per-control logic here on purpose. A control whose engine property is
// missing renders disabled rather than throwing, so a future engine rename
// degrades one row instead of blanking the panel.
import { ref, watch } from 'vue';
import { getStel } from '../engine.js';
import { LAYER_GROUPS, PROJECTIONS, getLayerValue, setLayerValue } from '../skyLayers.js';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close']);

// layer id -> current value; undefined means "engine has no such property".
const values = ref({});
const projection = ref(null);

function readAll() {
  const stel = getStel();
  if (!stel) return;
  const next = {};
  for (const group of LAYER_GROUPS) {
    for (const layer of group.layers) {
      next[`${group.id}.${layer.id}`] = getLayerValue(stel.core, layer.path);
    }
  }
  values.value = next;
  projection.value = stel.core.projection;
}

watch(() => props.open, (isOpen) => { if (isOpen) readAll(); }, { immediate: true });

function update(group, layer, raw) {
  const stel = getStel();
  if (!stel) return;
  const value = layer.type === 'range' ? Number(raw) : Boolean(raw);
  setLayerValue(stel.core, layer.path, value);
  values.value = { ...values.value, [`${group.id}.${layer.id}`]: value };
}

function setProjection(v) {
  const stel = getStel();
  if (!stel) return;
  stel.core.projection = Number(v);
  projection.value = Number(v);
}

const key = (g, l) => `${g.id}.${l.id}`;
const missing = (g, l) => values.value[key(g, l)] === undefined;
</script>

<template>
  <div v-if="open" class="layers-panel" role="dialog" aria-label="Sky layers">
    <div class="head">
      <h2 class="panel-title">Sky layers</h2>
      <button type="button" class="ctl" @click="emit('close')">Close</button>
    </div>

    <section v-for="group in LAYER_GROUPS" :key="group.id" class="group">
      <h3 class="group-title">{{ group.label }}</h3>

      <div v-for="layer in group.layers" :key="layer.id" class="row">
        <label v-if="layer.type === 'bool'" class="bool-row">
          <input
            type="checkbox"
            :checked="!!values[key(group, layer)]"
            :disabled="missing(group, layer)"
            @change="update(group, layer, $event.target.checked)"
          />
          <span class="row-label">{{ layer.label }}</span>
        </label>

        <div v-else class="range-row">
          <label class="row-label" :for="`ly-${group.id}-${layer.id}`">
            {{ layer.label }}
            <span class="value">{{ values[key(group, layer)] }}</span>
          </label>
          <input
            :id="`ly-${group.id}-${layer.id}`"
            type="range"
            :min="layer.min"
            :max="layer.max"
            :step="layer.step"
            :value="values[key(group, layer)] ?? layer.min"
            :disabled="missing(group, layer)"
            @input="update(group, layer, $event.target.value)"
          />
        </div>

        <p v-if="layer.note" class="note">{{ layer.note }}</p>
        <p v-if="missing(group, layer)" class="note missing">
          Not available in this engine build.
        </p>
      </div>
    </section>

    <section class="group">
      <h3 class="group-title">Projection</h3>
      <select class="select" :value="projection" @change="setProjection($event.target.value)">
        <option v-for="p in PROJECTIONS" :key="p.value" :value="p.value">{{ p.label }}</option>
      </select>
    </section>
  </div>
</template>

<style scoped>
.layers-panel {
  position: fixed;
  bottom: 5.5rem;
  left: 50%;
  transform: translateX(-50%);
  width: min(34rem, calc(100vw - 3rem));
  max-height: 65vh;
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

.panel-title,
.group-title {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  font-weight: normal;
}

.group { margin-top: 0.9rem; }
.group-title { margin-bottom: 0.4rem; }
.row { margin-bottom: 0.35rem; }

.bool-row { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.range-row { display: flex; flex-direction: column; gap: 0.15rem; }
.row-label { color: var(--text); }

.value {
  margin-left: 0.4rem;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
}

input[type='range'] { width: 100%; accent-color: var(--accent); }
input[type='checkbox'] { accent-color: var(--accent); }
input:disabled { opacity: 0.5; }

.select {
  width: 100%;
  padding: 0.3rem 0.5rem;
  background: var(--control-bg);
  border: 1px solid var(--control-border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font-serif);
  font-size: var(--font-size);
}

.ctl {
  padding: 0.3rem 0.6rem;
  background: var(--control-bg);
  border: 1px solid var(--control-border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font-serif);
  font-size: var(--font-size);
  cursor: pointer;
}
.ctl:hover { background: var(--control-bg-hover); }

.note { margin: 0.1rem 0 0 1.6rem; font-size: 11px; line-height: 1.35; color: var(--text-dim); }
.note.missing { color: var(--accent-dim); }
</style>
