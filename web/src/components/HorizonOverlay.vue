<script setup>
// HorizonOverlay.vue — the contributor's own horizon photo, drawn as a strip
// along the bottom of the sky.
//
// Deliberately NOT azimuth-aligned and not part of the engine's coordinate
// frame. The engine's real landscape module consumes pre-tiled HiPS
// panoramas; this is a decorative stand-in, and the caption says so, because
// a horizon that looks aligned but is not would be worse than none — someone
// would read a solstice alignment off it.
//
// The image never leaves the browser. See horizonImage.js for why that is a
// governance position rather than a v1 shortcut.
defineProps({
  src: { type: String, default: null },
});
</script>

<template>
  <div v-if="src" class="horizon">
    <img :src="src" class="horizon-img" alt="Local horizon photograph supplied by the viewer" />
    <p class="horizon-note">
      Decorative horizon — your own image, not aligned to compass bearings and
      never uploaded anywhere.
    </p>
  </div>
</template>

<style scoped>
.horizon {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* Above the sky canvas, below the engine's own overlay and every panel. */
  z-index: 2;
  pointer-events: none;
}

.horizon-img {
  display: block;
  width: 100%;
  height: 22vh;
  object-fit: cover;
  object-position: center bottom;
  /* Softens the hard top edge so the photo reads as ground meeting sky
     rather than a pasted rectangle. Not a glow — a mask. */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 18%);
  mask-image: linear-gradient(to bottom, transparent 0%, #000 18%);
}

.horizon-note {
  position: absolute;
  left: 1rem;
  bottom: 0.35rem;
  margin: 0;
  font-family: var(--font-serif);
  font-size: 11px;
  color: var(--text-dim);
}
</style>
