import { expect, it } from 'vitest'
import { assertUsablePresetRoster } from '../scripts/preset-runtime-smoke.ts'

it('rejects the reported skill-safety activation failure even when Standard works', () => {
  expect(() => assertUsablePresetRoster([{ id: 'standard' }, { id: 'skill-safety', broken: 'SyntaxError: Invalid or unexpected token' }]))
    .toThrow(/skill-safety failed to load: SyntaxError/)
})
it('requires the dedicated preset instead of accepting a silently omitted failure', () => {
  for (const value of [null, {}, [], [{ id: 'standard' }]]) {
    expect(() => assertUsablePresetRoster(value)).toThrow(/required agent presets/)
  }
})
it('accepts a complete usable roster and rejects other failed or malformed entries', () => {
  const shipped = [{ id: 'standard' }, { id: 'skill-safety' }]
  expect(() => assertUsablePresetRoster(shipped)).not.toThrow()
  expect(() => assertUsablePresetRoster([...shipped, { id: 'ptc', broken: 'missing tools' }])).toThrow(/ptc failed to load/)
  expect(() => assertUsablePresetRoster([...shipped, null])).toThrow(/invalid agent preset roster/)
})
