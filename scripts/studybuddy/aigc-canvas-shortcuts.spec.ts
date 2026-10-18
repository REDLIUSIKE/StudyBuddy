// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(pathToFileURL(resolve('../../integrations/toonflow/package.json')))
// The canonical business checkout owns these helpers; the Harness test imports that exact source.
const helpers = require('./apps/web/src/lib/canvasShortcuts.ts')
const modifierCodes: Record<string, [string, string]> = { Ctrl: ['Control', 'ControlLeft'], Alt: ['Alt', 'AltLeft'], Shift: ['Shift', 'ShiftLeft'], Meta: ['Meta', 'MetaLeft'] }
function eventFor(binding: string, type = 'keydown') {
  const parts = binding.split('+'), key = parts.find(part => !Object.hasOwn(modifierCodes, part)), modifier = modifierCodes[parts.at(-1)!]
  return new KeyboardEvent(type, { key: key === 'Space' ? ' ' : key ?? modifier?.[0] ?? '', code: key ?? modifier?.[1] ?? '', ctrlKey: parts.includes('Ctrl'), altKey: parts.includes('Alt'), shiftKey: parts.includes('Shift'), metaKey: parts.includes('Meta') })
}
for (const field of helpers.canvasShortcutFields) {
  it(`recognizes every original binding for ${field.id} without accepting extra modifiers`, () => {
    const binding: string = helpers.defaultCanvasShortcuts[field.id]
    expect(helpers.normalizeShortcut(binding)).toBe(binding)
    expect(helpers.isShortcutAllowed(field, binding)).toBe(true)
    for (const variant of helpers.getShortcutBindings(binding)) {
      const event = eventFor(variant)
      const pressed = new Set<string>([event.code])
      expect(helpers.shortcutMatches(event, binding)).toBe(true)
      expect(helpers.shortcutMatches(eventFor(variant, 'keyup'), binding)).toBe(false)
      expect(helpers.shortcutPressed(event, binding, pressed)).toBe(true)
      expect(helpers.shortcutLabel(variant)).not.toMatch(/Key[A-Z]/)
      expect(helpers.shortcutMatches(event, '')).toBe(false)
    }
  })
}
it('uses the configured wheel modifier and distinguishes both original copy-drag gestures', () => {
  const wheel = new WheelEvent('wheel', { altKey: true, deltaY: 100 })
  expect(helpers.shortcutPressed(wheel, 'Alt', new Set())).toBe(true)
  expect(helpers.shortcutPressed(wheel, 'Ctrl', new Set())).toBe(false)
  const alternate = eventFor('Ctrl+Alt')
  expect(helpers.shortcutPressed(alternate, 'Ctrl+Alt', new Set())).toBe(true)
  expect(helpers.shortcutPressed(alternate, 'Alt', new Set())).toBe(false)
})
