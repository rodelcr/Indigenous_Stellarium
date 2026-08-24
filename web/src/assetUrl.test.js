import { describe, it, expect } from 'vitest'
import { assetUrl } from './assetUrl.js'

describe('assetUrl', () => {
  it('is a no-op shape at the domain root (dev + backend-hosted deploys)', () => {
    expect(assetUrl('/engine/stellarium-web-engine.wasm', '/'))
      .toBe('/engine/stellarium-web-engine.wasm')
  })

  it('prefixes a GitHub Pages project subpath', () => {
    expect(assetUrl('/engine/stellarium-web-engine.wasm', '/Indigenous_Stellarium/'))
      .toBe('/Indigenous_Stellarium/engine/stellarium-web-engine.wasm')
  })

  it('accepts paths written without a leading slash', () => {
    expect(assetUrl('taxonomy.json', '/Indigenous_Stellarium/'))
      .toBe('/Indigenous_Stellarium/taxonomy.json')
  })

  // The specific production break this module exists to prevent: a
  // doubled slash makes GitHub Pages 404, and it is invisible in dev
  // because dev's base is '/' where the bug cannot appear.
  it('never emits a doubled slash at the join', () => {
    for (const base of ['/', '/repo/', '/repo', '/a/b/']) {
      for (const p of ['/x.json', 'x.json']) {
        expect(assetUrl(p, base)).not.toMatch(/\/\//)
      }
    }
  })

  it('tolerates a base with no trailing slash', () => {
    expect(assetUrl('/skydata/stars', '/repo')).toBe('/repo/skydata/stars')
  })

  it('falls back to the root when the base is empty or not a string', () => {
    expect(assetUrl('/taxonomy.json', '')).toBe('/taxonomy.json')
    expect(assetUrl('/taxonomy.json', undefined)).toBe('/taxonomy.json')
  })
})
