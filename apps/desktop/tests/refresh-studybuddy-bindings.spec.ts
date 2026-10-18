import { expect, it } from 'vitest'
import { replaceRuntimePin } from '../scripts/refresh-studybuddy-bindings.mjs'
import * as bindings from '../scripts/refresh-studybuddy-bindings.mjs'

const old = { manifestSha256: 'a'.repeat(64), sourceCommit: 'b'.repeat(40), sourceDigest: 'c'.repeat(64), lockDigest: 'd'.repeat(64) }
const next = { manifestSha256: 'e'.repeat(64), sourceCommit: 'f'.repeat(40), sourceDigest: '1'.repeat(64), lockDigest: '2'.repeat(64) }
const text = `// retain other task edits\nexport const PIN = {\n${Object.entries(old).map(([key, value]) => `  ${key}: '${value}',`).join('\n')}\n}\n`

it('updates every bound identity while retaining surrounding source and comments', () => {
  const updated = replaceRuntimePin(text, old, next)
  expect(updated.startsWith('// retain other task edits\nexport const PIN = {\n')).toBe(true)
  expect(updated).toContain(`manifestSha256: '${'e'.repeat(64)}'`)
  expect(updated).toContain(`sourceCommit: '${'f'.repeat(40)}'`)
  expect(updated).toContain(`sourceDigest: '${'1'.repeat(64)}'`)
  expect(updated).toContain(`lockDigest: '${'2'.repeat(64)}'`)
})

it('refuses stale or ambiguous source pins instead of overwriting a concurrent task', () => {
  expect(() => replaceRuntimePin(text, { ...old, manifestSha256: '0'.repeat(64) }, next)).toThrow('RESOURCE_PIN_CHANGED')
  expect(() => replaceRuntimePin(text + `// manifestSha256: '${old.manifestSha256}'`, old, next)).toThrow('RESOURCE_PIN_CHANGED')
})

it('refuses incomplete pins before publishing any replacement runtime', () => {
  expect(() => replaceRuntimePin(text.replace(/  lockDigest:.*\n/u, ''), old, next)).toThrow('RESOURCE_PIN_CHANGED')
})

it('updates the JSON-quoted development pins without changing their formatting', () => {
  const development = `// development only\nexport const PIN = ${JSON.stringify(old, null, 2)}\n`
  expect(replaceRuntimePin(development, old, next)).toBe(`// development only\nexport const PIN = ${JSON.stringify(next, null, 2)}\n`)
  expect(() => replaceRuntimePin(development, { ...old, sourceDigest: '0'.repeat(64) }, next)).toThrow('RESOURCE_PIN_CHANGED')
  expect(() => replaceRuntimePin(development + `// sourceCommit: '${old.sourceCommit}'`, old, next)).toThrow('RESOURCE_PIN_CHANGED')
})

const videoOld = { manifestSha256: 'a'.repeat(64), sourceDigest: 'c'.repeat(64), lockDigest: 'd'.repeat(64) }
const videoNext = { manifestSha256: 'e'.repeat(64), sourceDigest: '1'.repeat(64), lockDigest: '2'.repeat(64) }
const developmentSuffix = `\nexport const VIDEO_DEVELOPMENT_RUNTIME_PIN = ${JSON.stringify(videoOld, null, 2)}\n`

it.each([null, videoOld])('binds only the production video pin, retaining the accepted development pin (%j)', previous => {
  const source = `// accepted shared edits\nexport const VIDEO_RUNTIME_PIN: VideoResourcePin | null = ${JSON.stringify(previous, null, 2)}\n${developmentSuffix}`
  expect(bindings.replaceVideoRuntimePin(source, previous, videoNext)).toBe(
    `// accepted shared edits\nexport const VIDEO_RUNTIME_PIN: VideoResourcePin | null = ${JSON.stringify(videoNext, null, 2)}\n${developmentSuffix}`,
  )
})

it('refuses stale, ambiguous or invalid production video pins before promoting resources', () => {
  const source = `export const VIDEO_RUNTIME_PIN: VideoResourcePin | null = ${JSON.stringify(videoOld)}\n${developmentSuffix}`
  expect(() => bindings.replaceVideoRuntimePin(source, null, videoNext)).toThrow('RESOURCE_PIN_CHANGED')
  expect(() => bindings.replaceVideoRuntimePin(source + source, videoOld, videoNext)).toThrow('RESOURCE_PIN_CHANGED')
  expect(() => bindings.replaceVideoRuntimePin(source, videoOld, { ...videoNext, lockDigest: 'invalid' })).toThrow('RESOURCE_PIN_CHANGED')
})
