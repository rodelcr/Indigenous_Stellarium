<script setup>
// InfoPanel.vue — the deployment's licence/attribution/demo-sandbox
// surface. Three things live here because they're the same kind of
// obligation (tell the viewer the truth about what this app is and
// where its parts came from), not because they're visually related:
//
//   1. AGPL-3.0 source link. stellarium-web-engine (and this platform's
//      own code) is AGPL-3.0; its network-use clause (section 13) means
//      anyone interacting with this app over a network is entitled to
//      the complete corresponding source. That's a licence obligation,
//      not a nicety — this link must be visible, not just present
//      somewhere in a file nobody opens.
//   2. Per-culture attribution, generated (never hand-written) from each
//      shipped culture's own description.md via
//      deploy/generate_attribution.py at image-build time and served as
//      /attribution.json. Most shipped cultures are CC BY-SA, which
//      *requires* attribution — this is where that requirement is met.
//   3. The demo-sandbox notice: session-scoped storage, no steward
//      review yet (that's Phase 2 — see docs/DESIGN.md). The short form
//      is always on screen (the .sandbox-badge below, never hidden
//      behind a click); this panel carries the fuller explanation.
//
// The short badge + toggle button sit bottom-right — the one screen
// corner CulturePanel (top-left), StarInfo (top-right), and
// AuthoringPanel (bottom-left) leave free — so opening this panel never
// repositions or covers any of those already-shipped, already-tested
// components.
import { ref, onMounted } from 'vue';
import { renderInlineMarkdownLinks } from '../markdownLinks.js';
import { assetUrl } from '../assetUrl.js';

// Deployment-specific facts, injected at build time. Two of the claims in
// this panel are deployment-dependent and BOTH must be accurate:
//
//   * The AGPL-3.0 source link is a licence obligation, not a courtesy.
//     A link that points at the wrong repository does not satisfy §13.
//   * What happens to a contributor's draft differs by deploy: the static
//     build has no backend at all, so drafts never leave the visitor's own
//     browser, whereas the container build stores them server-side on
//     ephemeral hosting. Telling a visitor the wrong one is a consent
//     problem, not a copy nit.
//
// Defaults describe the container deploy; deploy/pages.sh overrides them.
const SOURCE_URL =
  import.meta.env.VITE_SOURCE_URL ||
  'https://github.com/rodelcr/Indigenous_Stellarium';
const DEPLOY_KIND = import.meta.env.VITE_DEPLOY_KIND || 'server';
const isStatic = DEPLOY_KIND === 'static';

const open = ref(false);
const cultures = ref([]);
const loadError = ref(null);

onMounted(async () => {
  try {
    const url = assetUrl('/attribution.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    cultures.value = await res.json();
  } catch (err) {
    // Non-fatal: the always-visible badge and AGPL link below don't
    // depend on this fetch succeeding. Only the per-culture attribution
    // list is affected, and it shows its own error state instead of
    // silently rendering nothing.
    console.error('InfoPanel: failed to load /attribution.json', err);
    loadError.value = err;
  }
});
</script>

<template>
  <div class="sandbox-badge">
    <p class="sandbox-text">
      <template v-if="isStatic"
        >Demo. Drafts stay in your browser. Nothing here is reviewed by
        community stewards yet.</template
      >
      <template v-else
        >Demo. Drafts may not persist. Nothing here is reviewed by community
        stewards yet.</template
      >
    </p>
    <button type="button" class="info-toggle" @click="open = !open">
      {{ open ? 'Close' : 'Sources & attribution' }}
    </button>
  </div>

  <div v-if="open" class="info-dialog" role="dialog" aria-label="Sources and attribution">
    <div class="info-dialog-inner">
      <section class="info-section">
        <h2 class="info-heading">This is a demo sandbox</h2>
        <p>
          Phase 1 of Indigenous Stellarium. It exists to show communities
          and collaborators what the tool does, so that stewards can be
          found for each culture. It is not open intake for cultural
          knowledge.
        </p>
        <ul>
          <li v-if="isStatic">
            There is no server. What you save is written to your browser's
            own storage and sent nowhere. Clear your browser data and it is
            gone; it will not appear on another device. Download a copy if
            you want to keep it.
          </li>
          <li v-else>
            Drafts are saved on free-tier hosting with temporary storage. A
            rebuild or restart can erase them.
          </li>
          <li>
            No steward reads what you enter. The review process described in
            the governance notes is not built yet. Authoring here shows how
            the tool works; it does not put your knowledge in anyone's care.
          </li>
        </ul>
      </section>

      <section class="info-section">
        <h2 class="info-heading">Source code (AGPL-3.0)</h2>
        <p>
          This platform is built on
          <a href="https://github.com/Stellarium/stellarium-web-engine" target="_blank" rel="noopener noreferrer"
            >stellarium-web-engine</a
          >, licensed AGPL-3.0. Under its network-use clause, anyone using
          this application is entitled to its complete source, including
          whatever we changed.
        </p>
        <p>
          Everything running here (frontend, backend, build and export
          tooling, and the patches we carry against the engine) is at
          <a :href="SOURCE_URL" target="_blank" rel="noopener noreferrer">{{
            SOURCE_URL
          }}</a
          >.
        </p>
      </section>

      <section class="info-section">
        <h2 class="info-heading">Sky culture attribution</h2>
        <p class="info-note">
          Constellation and star-name data comes from the official
          <a
            href="https://github.com/Stellarium/stellarium-skycultures"
            target="_blank"
            rel="noopener noreferrer"
            >stellarium-skycultures</a
          >
          repository. Each entry below is taken from that culture's own
          <code>description.md</code>. None of it is written by us.
        </p>
        <p v-if="loadError" class="info-error">Failed to load attribution data.</p>
        <div v-for="c in cultures" :key="c.id" class="culture-attribution">
          <h3 class="culture-title">{{ c.title }}</h3>
          <p v-if="c.authors_md" class="culture-authors" v-html="renderInlineMarkdownLinks(c.authors_md)"></p>
          <p v-else class="info-note">No authors section provided by upstream.</p>
          <p v-if="c.license_md" class="culture-license" v-html="renderInlineMarkdownLinks(c.license_md)"></p>
          <p v-else class="info-note">No license section provided by upstream.</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sandbox-badge {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  width: 240px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--text);
  border-radius: var(--radius);
  padding: 0.6rem;
  font-family: var(--font-serif);
  font-size: 11px;
  line-height: var(--line-height);
  z-index: 20;
}

.sandbox-text {
  margin: 0 0 0.4rem;
  color: var(--accent-dim);
}

.info-toggle {
  width: 100%;
  padding: 0.35rem;
  background: var(--control-bg);
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: var(--radius);
  font: inherit;
  cursor: pointer;
}

.info-toggle:hover {
  background: var(--control-bg-hover);
}

.info-dialog {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  padding: 2rem;
}

.info-dialog-inner {
  width: min(640px, 100%);
  max-height: 100%;
  overflow-y: auto;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--text);
  border-radius: var(--radius);
  padding: 1.25rem;
  font-family: var(--font-serif);
  font-size: var(--font-size);
  line-height: var(--line-height);
}

.info-section + .info-section {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--panel-border);
}

.info-heading {
  margin: 0 0 0.5rem;
  font-size: var(--font-size);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.info-section p {
  margin: 0 0 0.5rem;
}

.info-section ul {
  margin: 0 0 0.5rem;
  padding-left: 1.2rem;
}

.info-section li {
  margin-bottom: 0.4rem;
}

.info-section a {
  color: var(--accent);
}

.info-note {
  color: var(--text-dim);
  font-size: 12px;
}

.info-error {
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  padding: 0.4rem;
  border-radius: var(--radius);
}

.culture-attribution {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--panel-border);
}

.culture-attribution:first-of-type {
  margin-top: 0.5rem;
  padding-top: 0;
  border-top: none;
}

.culture-title {
  margin: 0 0 0.25rem;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-bright);
}

.culture-authors,
.culture-license {
  margin: 0 0 0.25rem;
  font-size: 12px;
  color: var(--text);
  white-space: pre-wrap;
}
</style>
