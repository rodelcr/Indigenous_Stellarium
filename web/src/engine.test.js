import { describe, it, expect } from 'vitest'
import { setInitialVisibility } from './engine.js'

// A stand-in for stel.core carrying the engine's own defaults for what
// setInitialVisibility touches (hints_visible defaults ON in stars.c).
function fakeStel() {
  return {
    core: {
      atmosphere: { visible: true },
      landscapes: { visible: true },
      constellations: {
        lines_visible: true, labels_visible: true, images_visible: true,
        show_only_pointed: false, unpointed_dim: 1,
      },
      stars: { hints_visible: true },
      satellites: { visible: true },
    },
  }
}

describe('setInitialVisibility — nothing Western labels the sky before a culture is chosen', () => {
  it('turns off constellation lines, labels and art', () => {
    const stel = fakeStel()
    setInitialVisibility(stel)
    expect(stel.core.constellations.lines_visible).toBe(false)
    expect(stel.core.constellations.labels_visible).toBe(false)
    expect(stel.core.constellations.images_visible).toBe(false)
  })

  // Star names come from the current sky culture, which at boot is the
  // engine's `western` one. Left at the engine default, Western star names
  // labelled the sky on first load while every figure was correctly hidden.
  it('turns off star names', () => {
    const stel = fakeStel()
    setInitialVisibility(stel)
    expect(stel.core.stars.hints_visible).toBe(false)
  })
})
