import { expect, it } from 'vitest'
import { platformChoices, parsePlatformSnapshot } from '../src/studybuddy-platform-contracts.ts'
import { fixture } from './fixtures/platform.ts'
it('publishes reviewed native Harness platform facts independently of personal Key capabilities', () => {
  const value = fixture()
  value.catalog.models.push({
    ...value.catalog.models[0]!,
    logicalModelId: 'dsh.zhipu.glm-5.3.chat',
    providerId: 'zhipu',
    exactModelId: 'glm-5.3',
    displayName: 'GLM-5.3',
  })
  const snapshot = parsePlatformSnapshot(value)
  expect(platformChoices(snapshot)).toHaveLength(2)
  expect(platformChoices(snapshot)[1]?.model.providerId).toBe('zhipu')
})
it('refuses an unrelated catalog, other tool rows, expired facts and incomplete output bounds', () => {
  const legacy = fixture()
  legacy.catalog.catalogRevision = 'legacy'
  expect(() => parsePlatformSnapshot(legacy)).toThrow()
  const other = fixture()
  other.catalog.models[0]!.toolId = 'hermes'
  expect(() => parsePlatformSnapshot(other)).toThrow()
  const expired = fixture()
  expired.expiresAt = '2026-01-01T00:00:00.000Z'
  expect(() => parsePlatformSnapshot(expired)).toThrow()
  const missing = fixture()
  ;(missing.catalog.models[0] as { maxOutputTokens: number | null }).maxOutputTokens = null
  expect(platformChoices(parsePlatformSnapshot(missing))).toEqual([])
})
