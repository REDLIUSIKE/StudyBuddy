import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { adaptAigcTool, normalizeAigcResult } from '../src/aigc-tool-adapter.ts'

it('keeps the original raw schema and replays canonical content without dispatch', async () => {
  let dispatched = 0
  const raw = { name: 'rawSchemaProbe', description: 'Full schema', parameters: { type: 'object', properties: { value: { type: 'string', pattern: '^OK$' } }, required: ['value'], additionalProperties: false },
    promptGuidelines: [], executionMode: 'sequential', schemaSha256: 'a'.repeat(64), plugin: { name: 'contractProbe', revision: 'b'.repeat(64) } }
  raw.schemaSha256 = createHash('sha256').update(JSON.stringify(raw.parameters)).digest('hex')
  const tool = adaptAigcTool(raw, async () => { dispatched++; throw Error('Replay cannot execute') })
  expect(tool.parameters).toEqual(raw.parameters)
  const value = await normalizeAigcResult({ content: [{ type: 'text', text: 'recorded' }], details: { saved: true } })
  expect(tool.output.render({}, value)).toEqual([{ type: 'text', text: 'recorded' }])
  expect(tool.output.presentationMeta?.({}, value)).toEqual({ saved: true })
  expect(dispatched).toBe(0)
})

it('requires durable native storage for foreign image results and rejects malformed bytes', async () => {
  await expect(normalizeAigcResult({ content: [{ type: 'image', data: 'bad', mimeType: 'image/png' }] })).rejects.toThrow()
  await expect(normalizeAigcResult({ content: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }] })).rejects.toThrow('AIGC_NATIVE_ATTACHMENTS_UNAVAILABLE')
  expect(() => adaptAigcTool({ name: 'invalid' }, async () => null)).toThrow()
})
