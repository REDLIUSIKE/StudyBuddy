/**
 * Display resolution: shipped presets resolve through dictionary keys, and
 * user-authored metadata is never translated.
 */

import { describe, expect, it } from 'vitest'
import { isBuiltInPreset, presetDisplayText, type BuiltInPresetCopyKey } from '../src/display.ts'

const t = (key: BuiltInPresetCopyKey): string => `t:${key}`

describe('presetDisplayText', () => {
  it('recognizes the shipped skill-safety preset and supplies its name and description', () => {
    expect(isBuiltInPreset({ id: 'skill-safety' })).toBe(true)
    expect(presetDisplayText({ id: 'skill-safety' }, t)).toEqual({
      name: 't:presetSkillSafetyName', description: 't:presetSkillSafetyDescription',
    })
    expect(isBuiltInPreset({ id: 'skill-safety', name: 'My safety workflow' })).toBe(false)
  })
  it('resolves a shipped preset through its dictionary keys', () => {
    expect(presetDisplayText({ id: 'standard' }, t)).toEqual({
      name: 't:presetStandardName',
      description: 't:presetStandardDescription',
    })
  })

  it('keeps user-authored metadata untranslated', () => {
    expect(presetDisplayText({ id: 'mine', name: '我的模式', description: '自述' }, t))
      .toEqual({ name: '我的模式', description: '自述' })
  })

  it('falls back to the id for a preset publishing no metadata', () => {
    // A system id outside the shipped set behaves like authored metadata:
    // there is no dictionary copy to resolve.
    expect(presetDisplayText({ id: 'future' }, t)).toEqual({ name: 'future' })
    expect(presetDisplayText({ id: 'bare' }, t)).toEqual({ name: 'bare' })
  })
})
