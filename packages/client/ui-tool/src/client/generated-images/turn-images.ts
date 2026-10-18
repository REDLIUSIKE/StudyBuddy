/** Recorded image tasks projected onto their owning Turn without changing Session events. */
import { fromMarkdown } from 'mdast-util-from-markdown'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { mediaTaskModel, type MediaTaskModel } from '../tool/models/media-generation-model.ts'

interface RecordedImage {
  readonly seq: number
  readonly task: MediaTaskModel
}
interface ImagesTurnData {
  readonly images: readonly RecordedImage[]
}
interface ImagesState extends ImagesTurnData {
  readonly turn: number
  readonly calls: ReadonlySet<string>
}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** Keyless image tasks returned by supported tools in this Turn. */
    'studybuddy-images': ImagesTurnData
  }
}

/** Accumulate only supported, successful image results using the existing Turn identity. */
export const imagesDefinition: ConversationNodeDefinition<ImagesState> = {
  kind: 'studybuddy-images',
  match: event => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call' && (event.data.name === 'generate_image' || event.data.name === 'generation_status')) {
      return { id: String(event.data.turn), role: 'update' }
    }
    if (event.type === 'tool/result' && event.surfaceOp === 'append') return { id: String(event.data.turn), role: 'update' }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('studybuddy-images requires turn/start')
    return { turn: match.event.data.turn, calls: new Set(), images: [] }
  },
  update: (context, match) => {
    const event = match.event
    if (event.type === 'tool/call') return { ...context.state, calls: new Set([...context.state.calls, event.data.callId]) }
    if (event.type !== 'tool/result' || event.data.message.isError
      || !context.state.calls.has(event.data.message.source.callId)) return context.state
    const task = mediaTaskModel(event.data.meta)
    if (task?.kind !== 'image') return context.state
    const image = { seq: event.seq, task }
    const images = [...context.state.images]
    const index = images.findIndex(value => value.task.requestId === task.requestId)
    if (index === -1) images.push(image)
    else images[index] = image
    return { ...context.state, images }
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    if (previous?.kind === 'turn' && previous.key === 'studybuddy-images'
      && previous.value.images === context.state.images) return previous
    return { kind: 'turn', turn: context.state.turn, key: 'studybuddy-images', value: { images: context.state.images } }
  },
}

interface MarkdownNode {
  readonly type: string
  readonly url?: string
  readonly identifier?: string
  readonly children?: readonly MarkdownNode[]
}

function imageDestinations(text: string): readonly string[] {
  const root = fromMarkdown(text), definitions = new Map<string, string>(), images: string[] = []
  const visit = (node: MarkdownNode, collect: boolean): void => {
    if (node.type === 'definition' && node.identifier !== undefined && node.url !== undefined) definitions.set(node.identifier, node.url)
    if (collect && node.type === 'image' && node.url !== undefined) images.push(node.url)
    if (collect && node.type === 'imageReference' && node.identifier !== undefined) {
      const url = definitions.get(node.identifier)
      if (url !== undefined) images.push(url)
    }
    for (const child of node.children ?? []) visit(child, collect)
  }
  visit(root, false)
  visit(root, true)
  return images
}

function referencesTask(destination: string, task: MediaTaskModel, base: string): boolean {
  if (destination === task.requestId) return true
  let url: URL, origin: URL
  try { origin = new URL(base); url = new URL(destination, origin) } catch { return false }
  return url.protocol === origin.protocol && url.host === origin.host && url.pathname === '/api/studybuddy-media'
    && url.searchParams.get('sessionId') === task.sessionId && url.searchParams.get('requestId') === task.requestId
    && url.searchParams.get('kind') === 'image' && url.searchParams.get('mode') === 'content'
}

/** Select completed images absent from the closing prose, retaining exact Session authorization.
 * @param owner - completed Turn and closing-reply sequence.
 * @param sessionId - viewed Session, never taken from model prose.
 * @param base - application origin used only to recognize an existing owned Markdown preview.
 * @returns unique images for the reply's visible result area.
 */
export function imagesForClosing(owner: TurnTailOwnerProps, sessionId: string, base: string): readonly MediaTaskModel[] {
  const closing = owner.turn.data.get('turn-tail')?.closing
  const destinations = closing?.blocks.flatMap(block => block.kind === 'text' ? imageDestinations(block.text) : []) ?? []
  return (owner.turn.data.get('studybuddy-images')?.images ?? [])
    .filter(({ seq, task }) => seq <= owner.seq && task.sessionId === sessionId
      && task.state === 'completed' && task.contentAvailable && !destinations.some(path => referencesTask(path, task, base)))
    .map(image => image.task)
}
