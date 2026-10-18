/** Register the Tool call tree, details renderer, and built-in atomic views. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteHostFacts } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { ToolCallTree } from './tool/ToolCallTree.tsx'
import { CONVERSATION_NS as NS } from './locale.ts'
import { askQuestionToolview } from './tool/toolviews/ask-question-row.tsx'
import { bashToolviewSample } from './tool/toolviews/bash-sample.tsx'
import { fileMutationToolview } from './tool/toolviews/file-mutation-row.tsx'
import { readToolview } from './tool/toolviews/read-row.tsx'
import { readImageToolview } from './tool/toolviews/read-image-row.tsx'
import { searchToolview } from './tool/toolviews/search-row.tsx'
import { detailsToolview } from './tool/toolviews/details-row.tsx'
import { todoToolview } from './tool/toolviews/todo-row.tsx'
import { webToolview } from './tool/toolviews/web-row.tsx'
import {mediaGenerationToolview} from './tool/toolviews/media-generation-row.tsx'
import {creativeProjectToolview} from './tool/toolviews/creative-project-row.tsx'
import { GeneratedImageTail } from './generated-images/GeneratedImageTail.tsx'
import { imagesDefinition } from './generated-images/turn-images.ts'
import { MEDIA_NS, en, zh } from './generated-images/locale.ts'
import { applyImageActions } from './image-actions/apply.ts'

/** Required services: the slot registry and the Remote face carrying the Host home used for POSIX `~`. */
export const inject = ['slots', 'remote']

/**
 * Mount the whole-Tool renderers and built-in atomic Tool registrations.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  applyImageActions(ctx)
  ctx.inject(['locale'], scope => {
    scope.effect(() => scope.locale.register(MEDIA_NS, { en, zh }), 'ui-tool: generated image dictionaries')
  })
  ctx.inject(['uiConversation', 'locale'], scope => {
    scope.uiConversation.events.register(imagesDefinition)
    scope.slots.inject('conversation.chat.turnTail', () => scope.slots.register({
      name: 'conversation.chat.turnTail', id: 'studybuddy-generated-images', order: -10, locale: MEDIA_NS,
    }, GeneratedImageTail))
  })
  const hostInfo: HostObservable<RemoteHostFacts> = {
    getSnapshot: () => ctx.remote.$host,
    subscribe: listener => ctx.on('connection/reset', listener),
  }
  const toolInject = () => ({ hooks: { hostInfo } })
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'tool-call',
    locale: NS,
    children: {
      'tool.call.toolview': { kind: 'keyed', scope: 'session' },
    },
    inject: toolInject,
  }, ToolCallTree))

  ctx.plugin(bashToolviewSample)
  ctx.plugin(readToolview)
  ctx.plugin(readImageToolview)
  ctx.plugin(fileMutationToolview)
  ctx.plugin(searchToolview)
  ctx.plugin(webToolview)
  ctx.plugin(mediaGenerationToolview)
  ctx.plugin(creativeProjectToolview)
  ctx.plugin(todoToolview)
  ctx.plugin(detailsToolview)
  ctx.plugin(askQuestionToolview)
}
