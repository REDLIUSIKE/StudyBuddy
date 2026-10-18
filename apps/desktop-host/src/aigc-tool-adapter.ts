/** Explicit foreign-tool adapter. Raw input constraints stay on the model wire and are enforced by the domain. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { isJsonValue, snapshotJsonValue } from '@deepseek-ai/dsh-util-values'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

const imageType = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const textPart = z.strictObject({ type: z.literal('text'), text: z.string() })
const imageRef = z.strictObject({ attachmentId: z.string().min(1).max(512), mediaType: imageType,
  bytes: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive(), name: z.string().optional(),
  originalDimensions: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }).optional() })
const canonical = z.strictObject({ content: z.array(z.discriminatedUnion('type', [textPart, z.strictObject({ type: z.literal('image'), attachment: imageRef })])), details: z.json() })
const foreign = z.looseObject({ content: z.array(z.discriminatedUnion('type', [textPart,
  z.object({ type: z.literal('image'), mimeType: imageType, data: z.string().max(28_000_000).base64(), name: z.string().max(256).optional() })])), details: z.json().optional() })
export const AigcToolRecord = z.strictObject({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9_:-]{0,127}$/), description: z.string().max(65536),
  parameters: z.record(z.string(), z.json()), promptGuidelines: z.array(z.string().max(65536)).max(256), executionMode: z.enum(['sequential', 'parallel']),
  schemaSha256: z.string().regex(/^[a-f0-9]{64}$/), plugin: z.strictObject({ name: z.string().max(96), revision: z.string().regex(/^[a-f0-9]{64}$/) }) })
export type AigcToolRecord = z.infer<typeof AigcToolRecord>
type StoreImages = (input: readonly SaveImageAttachment[]) => Promise<readonly ImageAttachmentRef[]>
function jsonValue(value: unknown): value is JsonValue { return isJsonValue(value) }

/** Normalize bytes once before the native tool result is recorded. Replays use only immutable references. */
export async function normalizeAigcResult(value: unknown, storeImages?: StoreImages): Promise<JsonValue> {
  const result = foreign.parse(value), images: SaveImageAttachment[] = []
  for (const part of result.content) if (part.type === 'image') images.push({ data: Buffer.from(part.data, 'base64'), mediaType: part.mimeType, ...(part.name === undefined ? {} : { name: part.name }) })
  if (images.length && !storeImages) throw Error('AIGC_NATIVE_ATTACHMENTS_UNAVAILABLE')
  const references = images.length ? await storeImages!(images) : []
  if (references.length !== images.length) throw Error('AIGC_NATIVE_ATTACHMENTS_INVALID')
  let image = 0
  const content = result.content.map(part => part.type === 'text' ? part : { type: 'image', attachment: references[image++] })
  const normalized: unknown = snapshotJsonValue(canonical.parse({ content, details: result.details ?? null }))
  if (!jsonValue(normalized)) throw Error('AIGC_TOOL_RESULT_INVALID')
  return normalized
}
export function renderAigcResult(value: JsonValue): ContentBlock[] {
  const result = canonical.safeParse(value)
  if (!result.success) return [{ type: 'text', text: JSON.stringify(value) }]
  return result.data.content.map(part => {
    if (part.type === 'text') return part
    const { name, originalDimensions, ...required } = part.attachment
    return { type: 'image', attachment: { ...required, attachmentId: AttachmentId(required.attachmentId),
      ...(name === undefined ? {} : { name }), ...(originalDimensions === undefined ? {} : { originalDimensions }) } }
  })
}

export function adaptAigcTool(value: unknown, invoke: (args: unknown, exec: ToolRunContext, tool: AigcToolRecord) => Promise<unknown>, storeImages?: StoreImages): ToolDefinition {
  const tool = AigcToolRecord.parse(value)
  if (tool.parameters.type !== 'object' || createHash('sha256').update(JSON.stringify(tool.parameters)).digest('hex') !== tool.schemaSha256) throw Error('AIGC_TOOL_SCHEMA_MISMATCH')
  return {
    name: tool.name, description: [tool.description, ...tool.promptGuidelines].filter(Boolean).join('\n'), parameters: tool.parameters,
    output: { schema: { type: 'object', properties: { content: { type: 'array', items: { type: 'object', additionalProperties: true } }, details: {} }, required: ['content', 'details'], additionalProperties: false },
      render: (_args, value) => renderAigcResult(value), presentationMeta: (_args, value) => canonical.safeParse(value).data?.details ?? null },
    presentCall: () => ({ card: 'generic', title: tool.name, kind: ['read', 'ls', 'getCanvas', 'findCanvasNodes', 'getCanvasNodes', 'getCanvasEdges', 'getNodeTools'].includes(tool.name) ? 'read' : 'execute' }),
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      const result = await invoke(args, exec, tool); exec.signal.throwIfAborted()
      const normalized = await normalizeAigcResult(result, storeImages); exec.signal.throwIfAborted(); return normalized
    },
  }
}
