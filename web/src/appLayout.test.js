import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const appVue = readFileSync(fileURLToPath(new URL('./App.vue', import.meta.url)), 'utf8')
const authoringVue = readFileSync(
  fileURLToPath(new URL('./components/AuthoringPanel.vue', import.meta.url)),
  'utf8'
)

describe('left column must not capture the sky', () => {
  // AuthoringPanel is a MULTI-ROOT component whose first root is a
  // full-viewport, position:fixed overlay canvas. Vue stamps the parent's
  // scope id onto every root, so a `.left-column > *` rule matches that
  // canvas too -- and granting it pointer-events:auto lays an invisible
  // sheet over the entire sky that swallows every click, drag and wheel
  // event the engine needs. That shipped once and broke all navigation.
  it('does not grant pointer-events to every child of the column', () => {
    const rule = /\.left-column\s*>\s*\*\s*\{[^}]*pointer-events\s*:\s*auto/
    expect(appVue).not.toMatch(rule)
  })

  it('grants pointer-events only to the two named panels', () => {
    expect(appVue).toMatch(/\.left-column\s*>\s*\.culture-panel/)
    expect(appVue).toMatch(/\.left-column\s*>\s*\.authoring-panel/)
  })

  it('the authoring overlay still declares pointer-events: none', () => {
    const block = authoringVue.match(/\.authoring-overlay\s*\{[^}]*\}/)
    expect(block, '.authoring-overlay style block not found').toBeTruthy()
    expect(block[0]).toMatch(/pointer-events\s*:\s*none/)
  })

  it('AuthoringPanel really is multi-root, which is what makes this a trap', () => {
    // If this ever stops being true the guard above is less critical -- but
    // the test should be updated deliberately, not silently pass.
    const tpl = authoringVue.match(/<template>([\s\S]*?)<\/template>/)[1]
    expect(tpl).toMatch(/<canvas[^>]*class="authoring-overlay"/)
  })
})
