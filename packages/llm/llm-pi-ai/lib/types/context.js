/**
 * Harness request-history conversion into pi-ai's Context vocabulary.
 *
 * @module dsh-llm-pi-ai/context
 */
import { brandString } from '@deepseek-ai/dsh-brand';
import { contentHasImage, IMAGE_OFFLOAD_REQUIRED_CODE, LlmError, offloadedImageText, projectOffloadedImages, requestImageHandleText, requiredImageOffload } from '@deepseek-ai/dsh-llm';
import { toPiAssistant } from "./replay.js";
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment';
import { DEFAULT_REQUEST_IMAGE_MAX_BYTES, DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET } from "./config.js";
/** Join the text blocks of a harness message. */
function flattenText(message) {
    return message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
}
/** Recover the pi-ai toolResult message for one harness tool-role message. */
function toolResultOf(message, toolNames, content) {
    return {
        role: 'toolResult',
        toolCallId: message.toolCallId,
        toolName: toolNames.get(message.toolCallId) ?? 'unknown',
        content: typeof content === 'string'
            ? [{ type: 'text', text: content || '(no output)' }]
            : content,
        isError: message.isError ?? false,
        timestamp: 0,
    };
}
/** Reject misplaced tool-change blocks and unsupported image roles before replay or image offloading. */
function assertSupportedHistory(messages) {
    for (const message of messages) {
        if (message.role !== 'developer' && message.content.some(block => block.type === 'tool-addition' || block.type === 'tool-removal')) {
            throw new LlmError('Tool-change blocks require developer role', 'UNSUPPORTED_CONTENT');
        }
        if (message.role !== 'user' && message.role !== 'tool' && contentHasImage(message.content)) {
            throw new LlmError(`pi-ai cannot represent an image in an in-history ${message.role} message`, 'UNSUPPORTED_CONTENT');
        }
        if (message.role === 'system' && message.content.some(block => block.type !== 'text')) {
            throw new LlmError('pi-ai cannot represent non-text system messages', 'UNSUPPORTED_CONTENT');
        }
    }
}
function userContent(blocks, requestImages, resolveImageAccess) {
    const content = [];
    for (const block of blocks) {
        switch (block.type) {
            case 'text':
                if (block.text.length > 0)
                    content.push({ type: 'text', text: block.text });
                break;
            case 'image': {
                const version = requestImages.get(block.attachment.attachmentId);
                content.push({
                    type: 'text',
                    text: requestImageHandleText(block.attachment, version, resolveImageAccess(block.attachment)),
                });
                content.push({
                    type: 'image',
                    data: Buffer.from(version.data).toString('base64'),
                    mimeType: version.mediaType,
                });
                break;
            }
            default:
                // Other merge-extensible blocks are not user-input vocabulary for pi-ai.
                break;
        }
    }
    if (content.every(block => block.type === 'text'))
        return content.map(block => block.text).join('');
    return content;
}
function collectImageRefs(blocks, refs) {
    for (const block of blocks) {
        if (block.type === 'image') {
            if (block.offloaded !== true)
                refs.set(block.attachment.attachmentId, block.attachment);
        }
    }
}
async function prepareRequestImages(messages, attachments, budget, signal) {
    const refs = new Map();
    for (const message of messages)
        collectImageRefs(message.content, refs);
    const orderedRefs = [...refs.values()];
    const prepared = await Promise.all(orderedRefs.map(ref => attachments.readImageRequest(ref, requestImageTarget(ref, budget), signal)));
    const versions = new Map();
    for (const [index, ref] of orderedRefs.entries()) {
        versions.set(ref.attachmentId, prepared[index]);
    }
    return versions;
}
/** Convert a projected declaration without its harness-owned activation marker. */
function piTool(tool) {
    return { name: tool.name, description: tool.description, parameters: tool.parameters };
}
function toolsOf(options) {
    return options.tools?.filter(tool => !tool.deferLoading).map(piTool);
}
/** Combine request-level text and leading system history into the initial prompt. */
function splitSystemPrompt(options) {
    const text = [options.system];
    let end = 0;
    for (const message of options.messages) {
        if (message.role !== 'system')
            break;
        text.push(flattenText(message));
        end++;
    }
    const systemPrompt = text.filter(Boolean).join('\n\n');
    return { systemPrompt: systemPrompt || undefined, messages: options.messages.slice(end) };
}
/** Assemble the request-level pi-ai context envelope shared by both conversion paths. */
function piContext(systemPrompt, options, messages) {
    const tools = toolsOf(options);
    return {
        ...systemPrompt !== undefined ? { systemPrompt } : {},
        messages,
        ...tools !== undefined && tools.length > 0 ? { tools } : {},
    };
}
/** Keep one developer event in one system update, resolving its projected tool declarations. */
function appendDeveloper(message, options, messages) {
    const content = [];
    const toolsAdded = [];
    const toolsRemoved = [];
    for (const block of message.content) {
        switch (block.type) {
            case 'text':
                if (block.text.length > 0)
                    content.push({ type: 'text', text: block.text });
                break;
            case 'tool-addition': {
                const tool = options.tools?.find(tool => tool.name === block.toolName);
                if (tool === undefined)
                    throw new LlmError(`pi-ai tool update references undeclared tool "${block.toolName}"`, 'INVALID_REQUEST');
                toolsAdded.push(piTool(tool));
                break;
            }
            case 'tool-removal':
                toolsRemoved.push({ name: block.toolName });
                break;
            default:
                throw new LlmError(`pi-ai cannot represent developer content ${block.type}`, 'UNSUPPORTED_CONTENT');
        }
    }
    if (content.length === 0 && toolsAdded.length === 0 && toolsRemoved.length === 0)
        return;
    messages.push({
        role: 'system',
        content,
        timestamp: 0,
        ...toolsAdded.length === 0 ? {} : { toolsAdded },
        ...toolsRemoved.length === 0 ? {} : { toolsRemoved },
    });
}
function appendAssistant(message, messages, toolNames, onReplayDegrade) {
    const assistant = toPiAssistant(message, onReplayDegrade);
    for (const block of assistant.content) {
        if (block.type === 'toolCall')
            toolNames.set(brandString(block.id), block.name);
    }
    messages.push(assistant);
}
/** Append shared system, developer, and assistant roles; true when consumed. */
function appendSharedHistory(message, options, messages, toolNames, onReplayDegrade) {
    if (message.role === 'developer') {
        appendDeveloper(message, options, messages);
        return true;
    }
    if (message.role === 'system') {
        const content = flattenText(message);
        if (content.length > 0)
            messages.push({ role: 'system', content, timestamp: 0 });
        return true;
    }
    if (message.role === 'assistant') {
        appendAssistant(message, messages, toolNames, onReplayDegrade);
        return true;
    }
    return false;
}
function textOnlyContext(options, onReplayDegrade) {
    assertSupportedHistory(options.messages);
    const split = splitSystemPrompt(options);
    const toolNames = new Map();
    const messages = [];
    for (const message of split.messages) {
        if (contentHasImage(message.content)) {
            throw new LlmError('pi-ai image conversion requires the durable attachment service', 'UNSUPPORTED_CONTENT');
        }
        if (appendSharedHistory(message, options, messages, toolNames, onReplayDegrade))
            continue;
        if (message.role === 'tool') {
            messages.push(toolResultOf(message, toolNames, flattenText(message)));
            continue;
        }
        messages.push({ role: 'user', content: flattenText(message), timestamp: 0 });
    }
    return piContext(split.systemPrompt, options, messages);
}
/** Deterministic request target for one source under the route budgets. */
function requestImageTarget(ref, budget) {
    return { ...requestImageDimensions(ref.width, ref.height, budget.maxPixels), maxBytes: budget.maxBytes };
}
export function toPiContext(options, images, onReplayDegrade) {
    return images === undefined
        ? textOnlyContext(options, onReplayDegrade)
        : toPiContextWithImages(options, images, onReplayDegrade);
}
async function toPiContextWithImages(options, images, onReplayDegrade) {
    const { attachments, resolveImageAccess, maxRequestImageBytes } = images;
    const requestImagePolicy = images.requestImagePolicy ?? {
        maxPixels: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
        maxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
    };
    assertSupportedHistory(options.messages);
    const split = splitSystemPrompt(options);
    const requestImages = await prepareRequestImages(split.messages, attachments, requestImagePolicy, options.signal);
    if (maxRequestImageBytes !== undefined) {
        const offloadImages = requiredImageOffload(split.messages, { representation: 'base64', maxBytes: maxRequestImageBytes }, block => requestImages.get(block.attachment.attachmentId).bytes);
        if (offloadImages > 0) {
            throw new LlmError(`pi-ai request images exceed the ${maxRequestImageBytes}-byte base64 bound; ${offloadImages} more oldest occurrence(s) must be offloaded.`, IMAGE_OFFLOAD_REQUIRED_CODE, { offloadImages });
        }
    }
    const exactMessages = projectOffloadedImages(split.messages, ref => offloadedImageText(ref, resolveImageAccess(ref)));
    const toolNames = new Map();
    const messages = [];
    for (const message of exactMessages) {
        if (appendSharedHistory(message, options, messages, toolNames, onReplayDegrade))
            continue;
        if (message.role === 'tool') {
            messages.push(toolResultOf(message, toolNames, userContent(message.content, requestImages, resolveImageAccess)));
            continue;
        }
        const content = userContent(message.content, requestImages, resolveImageAccess);
        messages.push({ role: 'user', content, timestamp: 0 });
    }
    return piContext(split.systemPrompt, options, messages);
}
//# sourceMappingURL=context.js.map