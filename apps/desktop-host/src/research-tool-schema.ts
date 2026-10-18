/** Presentation adapter only. K-Dense still validates every input against its complete original schema. */
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools'
const json = (): JsonSchemaNode => ({ oneOf: [{ type: 'null' }, { type: 'boolean' }, { type: 'number' }, { type: 'string' }, { type: 'array' }, { type: 'object', additionalProperties: true }] })
const keywords = ['type', 'description', 'title', 'default', 'enum', 'const', 'required', 'additionalProperties']
/** Map source schemas to the existing native tool schema subset without changing server validation. */
export function researchPresentationSchema(value: unknown): JsonSchemaNode {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('HARNESS_RESEARCH_TOOL_SCHEMA_INVALID')
  const source = value as Record<string, unknown>
  const alternatives = source.anyOf ?? source.oneOf
  if (Array.isArray(alternatives)) {
    const signatures = alternatives.map(row => row && typeof row === 'object' ? JSON.stringify(['const' in row ? row.const : undefined, 'type' in row ? row.type : undefined]) : '')
    if (new Set(signatures).size !== signatures.length) return json()
    return { oneOf: alternatives.map(researchPresentationSchema), ...(typeof source.description === 'string' ? { description: source.description } : {}) }
  }
  if (source.$ref || !source.type) return json()
  const result: Record<string, unknown> = {}
  for (const key of keywords) if (Object.hasOwn(source, key)) result[key] = source[key]
  if (source.properties && typeof source.properties === 'object') result.properties = Object.fromEntries(Object.entries(source.properties).map(([key, item]) => [key, researchPresentationSchema(item)]))
  if (source.items) result.items = researchPresentationSchema(source.items)
  return result as JsonSchemaNode
}
