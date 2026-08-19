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
// The name-resolution logic itself lives in starDisplayName.js (review
// finding #3) — this component only wires engine data into it.
import { reactive, ref, onMounted, onUnmounted, computed } from 'vue';
import { onStarSelected } from '../selection.js';
import { startDraft } from '../authoring.js';
import { startOverlay } from '../overlay.js';
import { getStel } from '../engine.js';
import { resolveStarDisplayName } from '../starDisplayName.js';

const props = defineProps({
  cultureKey: { type: String, default: null },
});

// --- Culture label resolution (review finding #1) ---------------------
// `cultureKey` is a raw taxonomy node id (e.g. "rapa_nui") — CulturePanel's
// culture-selected emit contract only carries the id, and that is not a
// name a community contributor should have to read. Mirrors CulturePanel's
// own onMounted `fetch('/taxonomy.json')` pattern exactly (read there
// first) rather than routing through App.vue, which stays thin and has no
// taxonomy involvement here.
//
// Collision note: taxonomy.json uses "western" as BOTH a top-level bucket
// id and a leaf child id. cultureKey values only ever come from
// CulturePanel's child.id (never a bucket id), so this map is built from
// leaf children ONLY — bucket ids are never inserted — which makes the
// collision structurally impossible to hit here, without needing to key by
// path.
const cultureLabels = ref({});

async function loadCultureLabels() {
  try {
    const res = await fetch('/taxonomy.json');
    if (!res.ok) throw new Error(`Failed to fetch /taxonomy.json: ${res.status}`);
    const data = await res.json();
    const labels = {};
    for (const bucket of data) {
      for (const child of bucket.children || []) {
        labels[child.id] = child.label;
      }
    }
    cultureLabels.value = labels;
  } catch (err) {
    console.error('AuthoringPanel: failed to load taxonomy.json for culture label', err);
    // Leave cultureLabels empty; cultureLabel below falls back to the raw
    // id, which is correct (real, not invented) even if less readable.
  }
}

// Falls back to the raw id only if the fetch failed or the id isn't found
// (e.g. before taxonomy.json has loaded) — never fabricates a label.
//
// While drawing, the label reflects `activeCultureKey` rather than
// `props.cultureKey` directly: loading a saved draft (see loadDraft below)
// can populate the authoring state for a culture that isn't the one
// currently selected in CulturePanel, and the status line should describe
// what's actually loaded, not what's merely selected in the tree.
const cultureLabel = computed(() => {
  const key = drawing.value ? activeCultureKey.value : props.cultureKey;
  if (!key) return key;
  return cultureLabels.value[key] || key;
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
const activeCultureKey = ref(null);
// Set when the current draft was loaded from a saved row (see loadDraft);
// null for a fresh, never-saved draft. Purely informational (which list
// entry is highlighted) — Save always POSTs a new row regardless (see
// handleSave's note on why this isn't wired to PUT).
const loadedDraftId = ref(null);

// hip -> { designations: string[], culturalNames: Array<object>, radec:
// [number,number,number]|null }
// Populated directly in the onStarSelected callback from primitive/plain
// values only — payload.obj (the raw WASM object) is never stored here or
// anywhere else in this component, per the known Vue-Proxy-wrapping gotcha.
const nameCache = new Map();

// Display-name priority/denylist logic lives in starDisplayName.js
// (pure, unit-tested there) — this just looks the cached info up and
// hands it off, adding the hip number back on for the template's
// secondary "HIP <n>" text.
function displayFor(hip) {
  const info = nameCache.get(hip);
  if (!info) return { primary: 'Selected star', sub: null, hip };
  return { ...resolveStarDisplayName(info), hip };
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

// --- My drafts (Task 7) -----------------------------------------------
// GET /api/drafts — the full saved-draft list, refreshed on mount and
// after every successful save. No pagination (YAGNI for a demo-scale
// list); ordering is whatever the API returns (most-recently-created
// first, per db.py).
const drafts = ref([]);
const draftsError = ref(null);

async function loadDrafts() {
  try {
    const res = await fetch('/api/drafts');
    if (!res.ok) throw new Error(`Failed to fetch /api/drafts: ${res.status}`);
    drafts.value = await res.json();
  } catch (err) {
    console.error('AuthoringPanel: failed to load drafts', err);
    draftsError.value = err;
  }
}

// Rehydrates a saved draft row (the API's DraftOut shape) back into a live
// authoring.js state machine. authoring.js exposes no "load" primitive —
// its getDraft() shape is fixed and not to be touched for this task — so
// this replays the saved `lines` through the same addStar()/penUp() calls
// a contributor's clicks would have produced, one committed polyline at a
// time, then sets the metadata/provenance fields with setMeta().
//
// Stars replayed this way have no nameCache entry (they weren't just
// clicked in the engine this session), so the star list falls back to
// displayFor()'s existing "Selected star" wording — the same neutral
// fallback used for a freshly-clicked star before its info arrives, not a
// fabricated name. The overlay (overlay.js) resolves each HIP directly
// against the engine regardless of nameCache, so the lines themselves
// still reappear on screen.
function loadDraft(saved) {
  draft = startDraft(saved.culture_key);
  nameCache.clear();
  for (const line of saved.lines) {
    for (const hip of line) draft.addStar(hip);
    draft.penUp();
  }

  const loadedMeta = {
    name_english: saved.name_english || '',
    name_native: saved.name_native || '',
    pronounce: saved.pronounce || '',
    notes: saved.notes || '',
    provenance: { ...emptyMeta().provenance, ...saved.provenance },
  };
  Object.assign(meta, loadedMeta);
  draft.setMeta(loadedMeta);

  activeCultureKey.value = saved.culture_key;
  loadedDraftId.value = saved.id;
  saveStatus.value = 'idle';
  saveError.value = null;
  drawing.value = true;
  stateVersion.value++;
}

// --- Actions -------------------------------------------------------------
function startConstellation() {
  if (!props.cultureKey) return;
  draft = startDraft(props.cultureKey);
  nameCache.clear();
  Object.assign(meta, emptyMeta());
  activeCultureKey.value = props.cultureKey;
  loadedDraftId.value = null;
  saveStatus.value = 'idle';
  saveError.value = null;
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
  activeCultureKey.value = null;
  loadedDraftId.value = null;
  saveStatus.value = 'idle';
  saveError.value = null;
  drawing.value = false;
  stateVersion.value++;
}

// --- Save (Task 7) ------------------------------------------------------
// 'idle' | 'saving' | 'saved' | 'error'
const saveStatus = ref('idle');
const saveError = ref(null);

// Always POSTs a new draft row, even when the current state was loaded
// from an existing one (loadedDraftId set) — PUT /api/drafts/{id} exists
// on the backend for a future edit-in-place flow, but wiring it up is out
// of scope here: the brief only asks for Save (create) and a drafts list
// that reloads state, not an edit/resume-and-overwrite flow, and adding
// that now would be scope creep past what Task 7 requires.
async function handleSave() {
  if (!draft) return;
  saveStatus.value = 'saving';
  saveError.value = null;
  try {
    const res = await fetch('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft.getDraft()),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const detail = body && body.detail ? JSON.stringify(body.detail) : `HTTP ${res.status}`;
      throw new Error(`Save failed: ${detail}`);
    }
    saveStatus.value = 'saved';
    await loadDrafts();
  } catch (err) {
    console.error('AuthoringPanel: failed to save draft', err);
    saveStatus.value = 'error';
    saveError.value = err.message;
  }
}

// --- Engine wiring ---------------------------------------------------
let unsubscribeStarSelected = null;
const overlayCanvas = ref(null);
let stopOverlay = null;

onMounted(() => {
  loadCultureLabels();
  loadDrafts();

  unsubscribeStarSelected = onStarSelected((payload) => {
    // Always cache display info for whatever star was just clicked (cheap,
    // keeps the cache honest even across culture switches), but only feed
    // it into the draft while actively drawing. Store the raw radec
    // vector, not a pre-formatted label — starDisplayName.js's
    // formatRaDecLabel() is pure and does its own c2s/anp/anpm math, so no
    // engine call is needed beyond this one getInfo() to get the vector.
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
      radec,
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

    <div class="drafts-section">
      <h3 class="drafts-title">My Drafts</h3>
      <div v-if="draftsError" class="panel-hint">Failed to load saved drafts.</div>
      <div v-else-if="drafts.length === 0" class="panel-hint">No drafts saved yet.</div>
      <ul v-else class="drafts-list">
        <li v-for="d in drafts" :key="d.id">
          <button
            type="button"
            class="draft-item"
            :class="{ active: loadedDraftId === d.id }"
            @click="loadDraft(d)"
          >
            <span class="draft-name">{{ d.name_english || d.name_native || 'Untitled draft' }}</span>
            <span class="draft-culture">{{ cultureLabels[d.culture_key] || d.culture_key }}</span>
          </button>
        </li>
      </ul>
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
        Drawing for <strong>{{ cultureLabel }}</strong>
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

      <button
        type="button"
        class="primary-button save-button"
        :disabled="!canSave || saveStatus === 'saving'"
        @click="handleSave"
      >
        {{ saveStatus === 'saving' ? 'Saving…' : 'Save' }}
      </button>
      <p v-if="saveStatus === 'saved'" class="panel-hint save-hint">Saved.</p>
      <p v-else-if="saveStatus === 'error'" class="panel-hint save-hint save-error">{{ saveError }}</p>
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
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--text);
  border-radius: var(--radius);
  padding: 0.75rem;
  font-family: var(--font-mono);
  font-size: var(--font-size);
  line-height: var(--line-height);
  z-index: 10;
}

.panel-title {
  margin: 0 0 0.5rem;
  font-size: var(--font-size);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.panel-hint {
  color: var(--text-dim);
  margin: 0.25rem 0;
}

.primary-button {
  width: 100%;
  padding: 0.5rem;
  background: var(--control-bg);
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: var(--radius);
  font: inherit;
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.drawing-status {
  margin-bottom: 0.5rem;
  color: var(--text);
}

.star-list {
  margin-bottom: 0.5rem;
}

.segment {
  margin: 0 0 0.4rem;
  padding-left: 1.2rem;
  color: var(--text);
}

.star-sub {
  color: var(--text-dim);
  margin-left: 0.25rem;
}

.star-hip {
  margin-left: 0.4rem;
  font-size: 11px;
  color: var(--text-dim);
}

.button-row {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.button-row button {
  flex: 1;
  padding: 0.35rem;
  background: var(--control-bg);
  border: 1px solid var(--control-border);
  color: var(--text);
  border-radius: var(--radius);
  font: inherit;
  cursor: pointer;
}

.button-row button:hover {
  background: var(--control-bg-hover);
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
  color: var(--text-dim);
  font-size: 12px;
}

.meta-form input,
.meta-form textarea {
  font: inherit;
  padding: 0.3rem;
  border-radius: var(--radius);
  border: 1px solid var(--control-border);
  background: var(--control-bg);
  color: var(--text-bright);
}

.meta-form textarea {
  min-height: 3.5em;
  resize: vertical;
}

.required {
  color: var(--accent);
}

.provenance-title {
  margin: 0.5rem 0 0.1rem;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.provenance-note {
  margin: 0 0 0.3rem;
  font-size: 11px;
  color: var(--text-dim);
}

.save-button {
  margin-top: 0.25rem;
}

.save-hint {
  text-align: center;
  font-size: 11px;
}

.save-error {
  text-align: left;
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  color: var(--text);
  padding: 0.4rem;
  border-radius: var(--radius);
}

.drafts-section {
  margin-bottom: 0.75rem;
}

.drafts-title {
  margin: 0 0 0.3rem;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.drafts-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 8rem;
  overflow-y: auto;
}

/* Mirrors CulturePanel.vue's .child-button: selection is a left rule and
   brighter text, never a coloured fill block. */
.draft-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  font: inherit;
  padding: 0.3rem 0.5rem;
  margin: 0.1rem 0;
  cursor: pointer;
  border-radius: var(--radius);
  border-left: 2px solid transparent;
}

.draft-item:hover {
  background: var(--control-bg-hover);
}

.draft-item.active {
  background: var(--control-bg);
  border-left-color: var(--accent);
}

.draft-item.active .draft-name {
  color: var(--text-bright);
}

.draft-name {
  font-weight: 400;
}

.draft-culture {
  font-size: 11px;
  color: var(--text-dim);
}
</style>
