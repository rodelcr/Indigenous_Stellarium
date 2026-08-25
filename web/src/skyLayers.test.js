import { describe, it, expect } from 'vitest'
import {
  getLayerValue, setLayerValue, LAYER_GROUPS, allLayers, PROJECTIONS,
} from './skyLayers.js'
import { ENGINE_PROPERTIES, CORE_SCALARS } from './engineProperties.fixture.js'

const fakeCore = () => ({
  constellations: { images_visible: false, bounds_visible: false, unpointed_dim: 0.35 },
  lines: { azimuthal: { visible: false }, meridian: { visible: true } },
  bortle_index: 3,
})

describe('path access', () => {
  it('reads a nested path', () => {
    expect(getLayerValue(fakeCore(), 'lines.azimuthal.visible')).toBe(false)
    expect(getLayerValue(fakeCore(), 'lines.meridian.visible')).toBe(true)
  })

  it('reads a top-level scalar', () => {
    expect(getLayerValue(fakeCore(), 'bortle_index')).toBe(3)
  })

  it('writes a nested path', () => {
    const c = fakeCore()
    expect(setLayerValue(c, 'lines.azimuthal.visible', true)).toBe(true)
    expect(c.lines.azimuthal.visible).toBe(true)
  })

  // A renamed engine property must degrade to a disabled control, not throw
  // during render and blank the whole panel.
  it('returns undefined for a missing path instead of throwing', () => {
    expect(getLayerValue(fakeCore(), 'nope.missing.deep')).toBeUndefined()
    expect(getLayerValue(fakeCore(), 'constellations.does_not_exist')).toBeUndefined()
  })

  it('refuses to write through a missing parent instead of throwing', () => {
    const c = fakeCore()
    expect(setLayerValue(c, 'nope.missing', true)).toBe(false)
    expect(c.nope).toBeUndefined()
  })
})

describe('layer table', () => {
  it('has unique ids across all groups', () => {
    const ids = allLayers().map((l) => `${l.group}.${l.id}`)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every layer declares a path and a known type', () => {
    for (const l of allLayers()) {
      expect(l.path, `${l.id} has no path`).toBeTruthy()
      expect(['bool', 'range']).toContain(l.type)
    }
  })

  it('every range declares min, max and step', () => {
    for (const l of allLayers().filter((l) => l.type === 'range')) {
      expect(typeof l.min, `${l.id}.min`).toBe('number')
      expect(typeof l.max, `${l.id}.max`).toBe('number')
      expect(typeof l.step, `${l.id}.step`).toBe('number')
      expect(l.min).toBeLessThan(l.max)
    }
  })

  // Wiring dss.visible means streaming order-9 tiles from someone else's
  // server on every pan. Excluded until there is a mirror; see the module
  // header. This test exists so it is a deliberate decision to reverse.
  it('does not wire the DSS survey', () => {
    expect(allLayers().some((l) => l.path.startsWith('dss.'))).toBe(false)
  })

  it('offers only real projections, not the enum sentinels', () => {
    const values = PROJECTIONS.map((p) => p.value)
    expect(values).not.toContain(0) // PROJ_NULL
    expect(values).not.toContain(6) // PROJ_COUNT
    expect(new Set(values).size).toBe(values.length)
  })

  it('puts horizon-based lines before equatorial ones', () => {
    // Not cosmetic: the astronomies in this app are organised around the
    // horizon and the meridian, and the ordering should say so.
    const lines = LAYER_GROUPS.find((g) => g.id === 'lines').layers.map((l) => l.id)
    expect(lines.indexOf('azimuthal')).toBeLessThan(lines.indexOf('equatorial'))
    expect(lines.indexOf('meridian')).toBeLessThan(lines.indexOf('equatorial'))
  })
})

describe('every declared path exists on the real engine', () => {
  // Checked against a snapshot of the live engine's property tree
  // (engineProperties.fixture.js) rather than by clicking 25 controls. A
  // mistyped path otherwise fails silently: the control renders, and
  // nothing happens when you use it.
  it('resolves every layer path', () => {
    const bad = []
    for (const l of allLayers()) {
      const parts = l.path.split('.')
      if (parts.length === 1) {
        if (!CORE_SCALARS.includes(parts[0])) bad.push(l.path)
        continue
      }
      const prop = parts.pop()
      const owner = parts.join('.')
      const props = ENGINE_PROPERTIES[owner]
      if (!props || !props.includes(prop)) bad.push(l.path)
    }
    expect(bad, `paths not found on the engine: ${bad.join(', ')}`).toEqual([])
  })

  it('the fixture itself still lists the properties we depend on elsewhere', () => {
    // Guards against someone trimming the fixture to make the test above pass.
    expect(ENGINE_PROPERTIES.constellations).toContain('unpointed_dim')
    expect(ENGINE_PROPERTIES.observer).toContain('latitude')
    expect(CORE_SCALARS).toContain('time_speed')
  })
})
