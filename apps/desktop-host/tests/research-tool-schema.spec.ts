import { expect, it } from 'vitest'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { researchPresentationSchema } from '../src/research-tool-schema.ts'
it('preserves field names and disjoint enum unions in the native supported schema', () => {
  const schema = researchPresentationSchema({ type: 'object', properties: { type: { anyOf: [{ type: 'string', const: 'note' }, { type: 'string', const: 'hypothesis' }] }, title: { type: 'string', minLength: 1 } }, required: ['type', 'title'] })
  assertSupportedJsonSchema(schema)
  expect(validateJsonSchemaValue(schema, { type: 'note', title: 'Observed result' })).toEqual([])
  expect(validateJsonSchemaValue(schema, { type: 'forged', title: 'Observed result' })).not.toEqual([])
})
it('keeps overlapping source alternatives readable without rejecting a source-valid value', () => {
  const schema = researchPresentationSchema({ type: 'object', properties: { data: { anyOf: [{ type: 'object', properties: { title: { type: 'string' } } }, { type: 'object', properties: { body: { type: 'string' } } }] } } })
  assertSupportedJsonSchema(schema)
  expect(validateJsonSchemaValue(schema, { data: { title: 'A', body: 'B' } })).toEqual([])
})
