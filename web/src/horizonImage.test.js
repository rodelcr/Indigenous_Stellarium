import { describe, it, expect } from 'vitest'
import { createHorizonStore, validateHorizonFile, MAX_BYTES } from './horizonImage.js'

const file = (type, size = 1000) => ({ type, size })

describe('validateHorizonFile', () => {
  it('accepts the common photo formats', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/avif']) {
      expect(validateHorizonFile(file(t))).toBeNull()
    }
  })

  it('rejects a non-image and names what it got', () => {
    expect(validateHorizonFile(file('application/pdf'))).toMatch(/application\/pdf/)
  })

  it('handles a file with no type rather than saying "undefined"', () => {
    expect(validateHorizonFile(file(''))).toMatch(/unknown type/)
  })

  it('rejects an oversized image and states both sizes', () => {
    const msg = validateHorizonFile(file('image/jpeg', MAX_BYTES + 1))
    expect(msg).toMatch(/25 MB/)
  })

  it('reports a missing file instead of throwing', () => {
    expect(validateHorizonFile(null)).toBe('No file chosen.')
  })
})

describe('horizon store URL lifecycle', () => {
  // The leak this guards is invisible in a browser check: the image simply
  // looks right while its predecessor's blob stays resident for the life of
  // the tab. A panorama is tens of megabytes.
  function tracked() {
    const created = [], revoked = []
    let n = 0
    const store = createHorizonStore({
      createUrl: () => { const u = `blob:${++n}`; created.push(u); return u },
      revokeUrl: (u) => revoked.push(u),
    })
    return { store, created, revoked }
  }

  it('revokes the previous URL when a new image replaces it', () => {
    const { store, created, revoked } = tracked()
    store.set(file('image/jpeg'))
    store.set(file('image/png'))
    store.set(file('image/webp'))
    expect(created).toHaveLength(3)
    expect(revoked).toEqual([created[0], created[1]])
    expect(store.url).toBe(created[2])
  })

  it('revokes on clear, and clearing twice is harmless', () => {
    const { store, created, revoked } = tracked()
    store.set(file('image/jpeg'))
    store.clear()
    store.clear()
    expect(revoked).toEqual([created[0]])
    expect(store.url).toBeNull()
  })

  it('does not mint a URL for a rejected file, nor drop the current one', () => {
    const { store, created, revoked } = tracked()
    store.set(file('image/jpeg'))
    const good = store.url
    const res = store.set(file('application/pdf'))
    expect(res.error).toBeTruthy()
    expect(created).toHaveLength(1)
    expect(revoked).toEqual([])
    expect(store.url).toBe(good)
  })
})
