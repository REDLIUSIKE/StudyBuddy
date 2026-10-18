import { ToolCallTree } from "./tool/ToolCallTree.js";
import { CONVERSATION_NS as NS } from "./locale.js";
import { askQuestionToolview } from "./tool/toolviews/ask-question-row.js";
import { bashToolviewSample } from "./tool/toolviews/bash-sample.js";
import { fileMutationToolview } from "./tool/toolviews/file-mutation-row.js";
import { readToolview } from "./tool/toolviews/read-row.js";
import { readImageToolview } from "./tool/toolviews/read-image-row.js";
import { searchToolview } from "./tool/toolviews/search-row.js";
import { detailsToolview } from "./tool/toolviews/details-row.js";
import { todoToolview } from "./tool/toolviews/todo-row.js";
import { webToolview } from "./tool/toolviews/web-row.js";
import { mediaGenerationToolview } from "./tool/toolviews/media-generation-row.js";
import { creativeProjectToolview } from "./tool/toolviews/creative-project-row.js";
import { GeneratedImageTail } from "./generated-images/GeneratedImageTail.js";
import { imagesDefinition } from "./generated-images/turn-images.js";
import { MEDIA_NS, en, zh } from "./generated-images/locale.js";
import { applyImageActions } from "./image-actions/apply.js";
/** Required services: the slot registry and the Remote face carrying the Host home used for POSIX `~`. */
export const inject = ['slots', 'remote'];
/**
 * Mount the whole-Tool renderers and built-in atomic Tool registrations.
 * @param ctx - Client root context.
 */
export function apply(ctx) {
    applyImageActions(ctx);
    ctx.inject(['locale'], scope => {
        scope.effect(() => scope.locale.register(MEDIA_NS, { en, zh }), 'ui-tool: generated image dictionaries');
    });
    ctx.inject(['uiConversation', 'locale'], scope => {
        scope.uiConversation.events.register(imagesDefinition);
        scope.slots.inject('conversation.chat.turnTail', () => scope.slots.register({
            name: 'conversation.chat.turnTail', id: 'studybuddy-generated-images', order: -10, locale: MEDIA_NS,
        }, GeneratedImageTail));
    });
    const hostInfo = {
        getSnapshot: () => ctx.remote.$host,
        subscribe: listener => ctx.on('connection/reset', listener),
    };
    const toolInject = () => ({ hooks: { hostInfo } });
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'tool-call',
        locale: NS,
        children: {
            'tool.call.toolview': { kind: 'keyed', scope: 'session' },
        },
        inject: toolInject,
    }, ToolCallTree));
    ctx.plugin(bashToolviewSample);
    ctx.plugin(readToolview);
    ctx.plugin(readImageToolview);
    ctx.plugin(fileMutationToolview);
    ctx.plugin(searchToolview);
    ctx.plugin(webToolview);
    ctx.plugin(mediaGenerationToolview);
    ctx.plugin(creativeProjectToolview);
    ctx.plugin(todoToolview);
    ctx.plugin(detailsToolview);
    ctx.plugin(askQuestionToolview);
}
//# sourceMappingURL=apply.js.map