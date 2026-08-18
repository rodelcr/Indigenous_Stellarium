<script setup>
// AuthoringPanel.vue — click-stars constellation authoring: draw polylines
// by selecting stars in sequence, then attach the metadata/provenance
// record a community contributes alongside the drawing.
//
// authoring.js (the pure state machine) stores and returns HIP numbers
// only — that's the correct interchange format (sky-culture `lines` are
// HIP arrays; see docs/DESIGN.md), and it must stay that way so exports
// keep loading in desktop Stellarium. But a contributor authoring a
// constellation is a community member, not an astronomer: nothing in this
// panel's UI shows a bare "HIP 91262" as a star's primary label. Every
// star in the live list is displayed name-first (this culture's name if
// the engine has one, else a proper/Bayer name, else a neutral positional
// fallback), with the HIP number as small secondary text — the same
// pattern StarInfo.vue already established. `nameCache` below exists
// purely to carry that display info; authoring.js's draft never sees it.
import { reactive, ref, onMounted, onUnmounted, computed } from 'vue';
import { onStarSelected } from '../selection.js';
import { startDraft } from '../authoring.js';
import { startOverlay } from '../overlay.js';
import { getStel } from '../engine.js';

const props = defineProps({
  cultureKey: { type: String, default: null },
});

// --- Draft / drawing state -------------------------------------------
// `draft` is the authoring.js state machine instance (a plain object of
// closures — not a WASM object, safe to hold directly). It is NOT made
// reactive itself (its internal state lives in closure variables, not
// Vue refs); `stateVersion` is bumped on every mutating call so the
// `segments` computed below knows to re-derive the display list.
let draft = null;
const drawing = ref(false);
const stateVersion = ref(0);

// hip -> { designations: string[], culturalNames: Array<object>, raDecLabel: string }
// Populated directly in the onStarSelected callback from primitive/plain
// values only — payload.obj (the raw WASM object) is never stored here or
// anywhere else in this component, per the known Vue-Proxy-wrapping gotcha.
const nameCache = new Map();

const BAYER_GREEK = {
  alf: 'α', bet: 'β', gam: 'γ', del: 'δ', eps: 'ε', zet: 'ζ', eta: 'η',
  the: 'θ', iot: 'ι', kap: 'κ', lam: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  omi: 'ο', pi: 'π', rho: 'ρ', sig: 'σ', tau: 'τ', ups: 'υ', phi: 'φ',
  chi: 'χ', psi: 'ψ', ome: 'ω',
};

const CATALOG_PREFIX = /^(HIP|GAIA|TYC|2MASS|SAO|WDS|HD)\s/;
const NAME_PREFIX = /^NAME\s+(.+)$/;
const BAYER_PREFIX = /^\*\s+(\S+)\s+(.+)$/;

// Priority order (see the course-correction this implements): (1) this
// culture's native name, (2) a proper name or Bayer designation stripped
// of its catalog prefix, (3) a neutral fallback derived from the star's
// actual sky position — never the raw HIP string as the primary label.
function extractProperOrBayer(designations) {
  if (!Array.isArray(designations)) return null;
  for (const d of designations) {
    const m = NAME_PREFIX.exec(d);
    if (m) return m[1];
  }
  for (const d of designations) {
    const m = BAYER_PREFIX.exec(d);
    if (m) {
      const abbrev = m[1].replace(/\.$/, '').toLowerCase();
      const greek = BAYER_GREEK[abbrev];
      return greek ? `${greek} ${m[2]}` : `${m[1]} ${m[2]}`;
    }
  }
  for (const d of designations) {
    if (!CATALOG_PREFIX.test(d) && !d.startsWith('* ')) return d;
  }
  return null;
}

function formatRaDecLabel(stel, radec) {
  try {
    const [ra, dec] = stel.c2s(radec);
    const raHours = stel.anp(ra) * (12 / Math.PI);
    const decDeg = stel.anpm(dec) * (180 / Math.PI);
    const h = Math.floor(raHours);
    const m = Math.floor((raHours - h) * 60);
    const sign = decDeg < 0 ? '−' : '+';
    const d = Math.floor(Math.abs(decDeg));
    return `Star near RA ${h}h${String(m).padStart(2, '0')}m, Dec ${sign}${d}°`;
  } catch {
    return 'Selected star';
  }
}

function displayFor(hip) {
  const info = nameCache.get(hip);
  if (!info) return { primary: 'Selected star', sub: null, hip };

  const cultural =
    Array.isArray(info.culturalNames) && info.culturalNames.length > 0
      ? info.culturalNames[0]
      : null;
  if (cultural && cultural.name_native) {
    return { primary: cultural.name_native, sub: cultural.name_pronounce || null, hip };
  }

  const properOrBayer = extractProperOrBayer(info.designations);
  if (properOrBayer) return { primary: properOrBayer, sub: null, hip };

  return { primary: info.raDecLabel || 'Selected star', sub: null, hip };
}

// Segments mirror draft.getDraft().lines exactly (each entry is one
// polyline / pen stroke), each star resolved to its display info.
const segments = computed(() => {
  stateVersion.value; // reactive dependency — see note on `draft` above
  if (!draft) return [];
  return draft.getDraft().lines.map((line) => line.map(displayFor));
});

const canStart = computed(() => !!props.cultureKey && !drawing.value);

// --- Metadata / provenance form ----------------------------------------
function emptyMeta() {
  return {
    name_english: '',
    name_native: '',
    pronounce: '',
    notes: '',
    provenance: { contributor: '', community: '', source: '', permission: '' },
  };
}

const meta = reactive(emptyMeta());

function updateMeta(field, value) {
  meta[field] = value;
  if (draft) draft.setMeta({ [field]: value });
}

function updateProvenance(field, value) {
  meta.provenance[field] = value;
  if (draft) draft.setMeta({ provenance: { [field]: value } });
}

const requiredFieldsFilled = computed(() => {
  return (
    meta.name_english.trim() !== '' &&
    meta.name_native.trim() !== '' &&
    meta.provenance.contributor.trim() !== '' &&
    meta.provenance.community.trim() !== '' &&
    meta.provenance.source.trim() !== '' &&
    meta.provenance.permission.trim() !== ''
  );
});

const hasAtLeastOneLine = computed(() => segments.value.some((line) => line.length >= 2));

const canSave = computed(() => drawing.value && requiredFieldsFilled.value && hasAtLeastOneLine.value);

// --- Actions -------------------------------------------------------------
function startConstellation() {
  if (!props.cultureKey) return;
  draft = startDraft(props.cultureKey);
  nameCache.clear();
  Object.assign(meta, emptyMeta());
  drawing.value = true;
  stateVersion.value++;
}

function penUp() {
  if (!draft) return;
  draft.penUp();
  stateVersion.value++;
}

function undo() {
  if (!draft) return;
  draft.undo();
  stateVersion.value++;
}

function clearDraft() {
  draft = null;
  nameCache.clear();
  Object.assign(meta, emptyMeta());
  drawing.value = false;
  stateVersion.value++;
}

// Task 7 wires this to a POST of draft.getDraft(). For now it is
// deliberately inert — this panel's job is the drawing/metadata UI, not
// persistence.
function handleSave() {
  // no-op: backend integration lands in Task 7.
}

// --- Engine wiring ---------------------------------------------------
let unsubscribeStarSelected = null;
const overlayCanvas = ref(null);
let stopOverlay = null;

onMounted(() => {
  unsubscribeStarSelected = onStarSelected((payload) => {
    // Always cache display info for whatever star was just clicked (cheap,
    // keeps the cache honest even across culture switches), but only feed
    // it into the draft while actively drawing.
    const stel = getStel();
    let radec = null;
    if (stel) {
      try {
        radec = payload.obj.getInfo('radec', stel.core.observer);
      } catch {
        radec = null;
      }
    }
    nameCache.set(payload.hip, {
      designations: payload.designations,
      culturalNames: payload.culturalNames,
      raDecLabel: stel && radec ? formatRaDecLabel(stel, radec) : 'Selected star',
    });

    if (!drawing.value || !draft) return;
    draft.addStar(payload.hip);
    stateVersion.value++;
  });

  if (overlayCanvas.value) {
    stopOverlay = startOverlay(overlayCanvas.value, () => (draft ? draft.getDraft().lines : []));
  }
});

onUnmounted(() => {
  if (unsubscribeStarSelected) unsubscribeStarSelected();
  if (stopOverlay) stopOverlay();
});
</script>

<template>
  <canvas ref="overlayCanvas" class="authoring-overlay"></canvas>

  <div class="authoring-panel">
    <h2 class="panel-title">Constellation Authoring</h2>

    <div v-if="!props.cultureKey" class="panel-hint">
      Select a sky culture to begin authoring a constellation for it.
    </div>

    <button
      v-if="!drawing"
      type="button"
      class="primary-button"
      :disabled="!canStart"
      @click="startConstellation"
    >
      New constellation
    </button>

    <template v-else>
      <div class="drawing-status">
        Drawing for <strong>{{ props.cultureKey }}</strong>
      </div>

      <div class="star-list">
        <div v-if="segments.length === 0" class="panel-hint">
          Click stars in the sky to begin a line.
        </div>
        <ol v-for="(line, i) in segments" :key="i" class="segment">
          <li v-for="(star, j) in line" :key="j">
            {{ star.primary }}
            <span v-if="star.sub" class="star-sub">({{ star.sub }})</span>
            <span class="star-hip">HIP {{ star.hip }}</span>
          </li>
        </ol>
      </div>

      <div class="button-row">
        <button type="button" @click="penUp">Pen up</button>
        <button type="button" @click="undo">Undo</button>
        <button type="button" @click="clearDraft">Clear</button>
      </div>

      <form class="meta-form" @submit.prevent>
        <label>
          Name (English) <span class="required">*</span>
          <input
            type="text"
            :value="meta.name_english"
            placeholder="Name in English"
            @input="updateMeta('name_english', $event.target.value)"
          />
        </label>
        <label>
          Name (in your language) <span class="required">*</span>
          <input
            type="text"
            :value="meta.name_native"
            placeholder="Name in your language"
            @input="updateMeta('name_native', $event.target.value)"
          />
        </label>
        <label>
          Pronunciation
          <input
            type="text"
            :value="meta.pronounce"
            placeholder="How is it pronounced?"
            @input="updateMeta('pronounce', $event.target.value)"
          />
        </label>
        <label>
          Notes
          <textarea
            :value="meta.notes"
            placeholder="Any additional notes"
            @input="updateMeta('notes', $event.target.value)"
          ></textarea>
        </label>

        <h3 class="provenance-title">Provenance</h3>
        <p class="provenance-note">
          This is the record of who holds this knowledge and under what terms it was
          shared. All fields below are required.
        </p>
        <label>
          Contributor <span class="required">*</span>
          <input
            type="text"
            :value="meta.provenance.contributor"
            placeholder="Who is contributing this?"
            @input="updateProvenance('contributor', $event.target.value)"
          />
        </label>
        <label>
          Community <span class="required">*</span>
          <input
            type="text"
            :value="meta.provenance.community"
            placeholder="Which community holds this knowledge?"
            @input="updateProvenance('community', $event.target.value)"
          />
        </label>
        <label>
          Source <span class="required">*</span>
          <input
            type="text"
            :value="meta.provenance.source"
            placeholder="Where does this come from?"
            @input="updateProvenance('source', $event.target.value)"
          />
        </label>
        <label>
          Permission <span class="required">*</span>
          <input
            type="text"
            :value="meta.provenance.permission"
            placeholder="Under what terms was this shared?"
            @input="updateProvenance('permission', $event.target.value)"
          />
        </label>
      </form>

      <button type="button" class="primary-button save-button" :disabled="!canSave" @click="handleSave">
        Save
      </button>
      <p class="panel-hint save-hint">Saving will be enabled once backend support lands.</p>
    </template>
  </div>
</template>

<style scoped>
.authoring-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}

.authoring-panel {
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  width: 320px;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  background: rgba(15, 15, 25, 0.85);
  color: #eee;
  border-radius: 6px;
  padding: 0.75rem;
  font: 13px/1.4 system-ui, sans-serif;
  z-index: 10;
}

.panel-title {
  margin: 0 0 0.5rem;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #bbb;
}

.panel-hint {
  color: #999;
  font-style: italic;
  margin: 0.25rem 0;
}

.primary-button {
  width: 100%;
  padding: 0.5rem;
  background: rgba(90, 140, 255, 0.35);
  border: 1px solid rgba(120, 160, 255, 0.6);
  color: #fff;
  border-radius: 4px;
  font: inherit;
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.drawing-status {
  margin-bottom: 0.5rem;
  color: #ccc;
}

.star-list {
  margin-bottom: 0.5rem;
}

.segment {
  margin: 0 0 0.4rem;
  padding-left: 1.2rem;
  color: #ddd;
}

.star-sub {
  color: #999;
  font-style: italic;
  margin-left: 0.25rem;
}

.star-hip {
  margin-left: 0.4rem;
  font-size: 10.5px;
  color: #888;
}

.button-row {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.button-row button {
  flex: 1;
  padding: 0.35rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #eee;
  border-radius: 4px;
  font: inherit;
  cursor: pointer;
}

.button-row button:hover {
  background: rgba(255, 255, 255, 0.16);
}

.meta-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.meta-form label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  color: #ccc;
  font-size: 12px;
}

.meta-form input,
.meta-form textarea {
  font: inherit;
  padding: 0.3rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.meta-form textarea {
  min-height: 3.5em;
  resize: vertical;
}

.required {
  color: #e0a34a;
}

.provenance-title {
  margin: 0.5rem 0 0.1rem;
  font-size: 12.5px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: #bbb;
}

.provenance-note {
  margin: 0 0 0.3rem;
  font-size: 11.5px;
  color: #999;
}

.save-button {
  margin-top: 0.25rem;
}

.save-hint {
  text-align: center;
  font-size: 11px;
}
</style>
