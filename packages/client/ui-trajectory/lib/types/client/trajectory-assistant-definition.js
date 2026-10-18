import { assistantStreamFirstTokenTime } from '@deepseek-ai/dsh-llm/assistant-stream';
import { trajectoryNode } from "./trajectory-definition-common.js";
import { displayFailure, emptyAssistantBlock, isTokenDelta, toAssistantBlock, toAssistantBlocks, } from "./trajectory-event-projection.js";
function initialState(turn, step, startSeq, startTime, started) {
    return {
        turn,
        step,
        startSeq,
        startTime,
        started,
        blocks: [],
        visibleBlocks: 0,
        firstVisibleSeq: undefined,
        firstVisibleTime: undefined,
        firstTokenTime: undefined,
        final: undefined,
        usage: undefined,
        retry: undefined,
        stepEnd: undefined,
    };
}
function compactBlocks(blocks) {
    return blocks.filter((block) => block !== undefined);
}
function blockIsVisible(block) {
    if (block === undefined || block.kind === 'tool-call')
        return false;
    if (block.kind === 'text' || block.kind === 'reasoning')
        return block.text.trim() !== '';
    return true;
}
function countVisibleBlocks(blocks) {
    let count = 0;
    for (const block of blocks)
        if (blockIsVisible(block))
            count++;
    return count;
}
function hasInterruptionEvidence(blocks) {
    return blocks.some((block) => {
        if (block.kind === 'text' || block.kind === 'reasoning')
            return block.text.trim() !== '';
        return true;
    });
}
function addUsage(current, next) {
    return {
        inputTokens: (current?.inputTokens ?? 0) + next.inputTokens,
        outputTokens: (current?.outputTokens ?? 0) + next.outputTokens,
        ...(current?.cacheReadTokens === undefined && next.cacheReadTokens === undefined
            ? {}
            : { cacheReadTokens: (current?.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0) }),
        ...(current?.cacheWriteTokens === undefined && next.cacheWriteTokens === undefined
            ? {}
            : { cacheWriteTokens: (current?.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0) }),
        ...(current?.reasoningTokens === undefined && next.reasoningTokens === undefined
            ? {}
            : { reasoningTokens: (current?.reasoningTokens ?? 0) + (next.reasoningTokens ?? 0) }),
    };
}
function updateChunk(state, chunk, seq, time) {
    if (chunk.type === 'usage') {
        return { ...state, usage: addUsage(state.usage, chunk.usage) };
    }
    const blocks = [...state.blocks];
    let changedIndex = -1;
    let previousVisible = false;
    switch (chunk.type) {
        case 'block-start':
            changedIndex = chunk.index;
            previousVisible = blockIsVisible(blocks[chunk.index]);
            blocks[chunk.index] = emptyAssistantBlock(chunk.blockType);
            break;
        case 'text-delta': {
            const previous = blocks[chunk.index];
            changedIndex = chunk.index;
            previousVisible = blockIsVisible(previous);
            blocks[chunk.index] = {
                kind: 'text',
                text: (previous?.kind === 'text' ? previous.text : '') + chunk.text,
            };
            break;
        }
        case 'reasoning-delta': {
            const previous = blocks[chunk.index];
            changedIndex = chunk.index;
            previousVisible = blockIsVisible(previous);
            blocks[chunk.index] = {
                kind: 'reasoning',
                text: (previous?.kind === 'reasoning' ? previous.text : '') + chunk.text,
            };
            break;
        }
        case 'tool-call-delta': {
            const previous = blocks[chunk.index];
            changedIndex = chunk.index;
            previousVisible = blockIsVisible(previous);
            const base = previous?.kind === 'tool-call'
                ? previous
                : { kind: 'tool-call', callId: '', name: '', argsRaw: '' };
            blocks[chunk.index] = {
                kind: 'tool-call',
                callId: base.callId || String(chunk.id),
                name: chunk.name ?? base.name,
                argsRaw: base.argsRaw + chunk.argumentsDelta,
            };
            break;
        }
        case 'block-end':
            changedIndex = chunk.index;
            previousVisible = blockIsVisible(blocks[chunk.index]);
            blocks[chunk.index] = toAssistantBlock(chunk.block);
            break;
        default:
            return state;
    }
    const visibleBlocks = state.visibleBlocks
        - Number(previousVisible)
        + Number(blockIsVisible(blocks[changedIndex]));
    return {
        ...state,
        blocks,
        visibleBlocks,
        ...(visibleBlocks > 0 && state.firstVisibleSeq === undefined
            ? { firstVisibleSeq: seq, firstVisibleTime: time }
            : {}),
        ...(isTokenDelta(chunk) && state.firstTokenTime === undefined
            ? { firstTokenTime: time }
            : {}),
    };
}
/** The Step retains its first token across live chunks and settled retry attempts. */
function settleTiming(state, event) {
    return {
        ...state,
        firstTokenTime: state.firstTokenTime ?? assistantStreamFirstTokenTime(event.data.stream),
    };
}
function settleMessage(state, match, event) {
    const blocks = toAssistantBlocks(event.data.message.content);
    return {
        ...settleTiming(state, event),
        blocks,
        visibleBlocks: countVisibleBlocks(blocks),
        final: match,
        usage: event.data.usage,
    };
}
function closedBoundary(context) {
    if (context.state?.stepEnd?.event.type === 'step/end')
        return context.state.stepEnd.event;
    const location = context.start?.location
        ?? context.matches.at(-1)?.location;
    if (location?.kind === 'step' && location.step.status === 'closed')
        return location.step.end;
    if ((location?.kind === 'step' || location?.kind === 'turn')
        && location.turn.status === 'closed')
        return location.turn.end;
    return undefined;
}
function fallbackState(context) {
    let state;
    for (const match of context.matches) {
        const event = match.event;
        if (event.type === 'assistant/live-chunk') {
            state ??= initialState(event.data.turn, event.data.step, event.seq, event.time, false);
            state = updateChunk(state, event.data.chunk, event.seq, event.time);
        }
        else if (event.type === 'assistant/attempt') {
            state ??= initialState(event.data.turn, event.data.step, event.seq, event.time, false);
            state = settleTiming(state, event);
        }
        else if (event.type === 'assistant/message') {
            state ??= initialState(event.data.turn, event.data.step, event.seq, event.time, false);
            state = settleMessage(state, match, event);
        }
        else if (event.type === 'step/end' && state !== undefined) {
            state = { ...state, stepEnd: match };
        }
    }
    return state;
}
function finalNode(state, context) {
    const final = state.final;
    if (final?.event.type === 'assistant/message') {
        const event = final.event;
        return {
            kind: 'assistant',
            seq: event.seq,
            messageId: event.data.message.id,
            time: event.time,
            turn: state.turn,
            step: state.step,
            blocks: toAssistantBlocks(event.data.message.content),
            usage: event.data.usage,
            providerMetadata: {
                provider: event.data.message.source.provider,
                model: event.data.message.source.model,
            },
            timing: {
                stepStartTime: state.started ? state.startTime : null,
                firstTokenTime: state.firstTokenTime ?? null,
                completedTime: event.time,
            },
            ...(event.data.interrupted === true ? { interrupted: true } : {}),
        };
    }
    const boundary = closedBoundary(context);
    if (boundary === undefined)
        return undefined;
    const blocks = compactBlocks(state.blocks);
    if (!hasInterruptionEvidence(blocks))
        return undefined;
    return {
        kind: 'assistant',
        seq: boundary.seq - 0.9,
        time: boundary.time,
        turn: state.turn,
        step: state.step,
        blocks,
        interrupted: true,
    };
}
function assistantRequest(state, node, boundary) {
    if (!state.started)
        return undefined;
    const status = node !== undefined
        ? node.interrupted === true ? 'error' : 'complete'
        : boundary !== undefined ? 'error' : 'running';
    return {
        purpose: 'assistant',
        startSeq: state.startSeq,
        turn: state.turn,
        step: state.step,
        startedAt: state.startTime,
        completedAt: node?.time ?? boundary?.time ?? null,
        status,
        ...(state.retry === undefined
            ? {}
            : {
                error: state.retry.message,
                ...(state.retry.code === undefined ? {} : { errorCode: state.retry.code }),
                retry: state.retry.retry,
                ...(state.retry.maxRetries === undefined ? {} : { maxRetries: state.retry.maxRetries }),
                retryDelayMs: state.retry.delayMs,
            }),
        ...(node?.messageId === undefined
            ? {}
            : {
                resultSeq: node.seq,
                ...(node.providerMetadata === undefined ? {} : { providerMetadata: node.providerMetadata }),
            }),
        ...(state.usage === undefined ? {} : { usage: state.usage }),
    };
}
/** Trajectory-owned Assistant streaming, settlement, and request lifecycle. */
const trajectoryAssistantDefinition = {
    kind: 'trajectory-assistant-step',
    target: 'trajectory',
    match: (event) => {
        if (event.type === 'step/start') {
            return { id: `${event.data.turn}:${event.data.step}`, role: 'start' };
        }
        if (event.type === 'assistant/live-chunk'
            || event.type === 'assistant/message'
            || event.type === 'assistant/attempt'
            || event.type === 'llm/retry'
            || event.type === 'step/end') {
            return { id: `${event.data.turn}:${event.data.step}`, role: 'update' };
        }
        return null;
    },
    start: (_context, match) => {
        if (match.event.type !== 'step/start') {
            throw new Error('trajectory-assistant-step start requires step/start');
        }
        return initialState(match.event.data.turn, match.event.data.step, match.event.seq, match.event.time, true);
    },
    update: (context, match) => {
        if (match.event.type === 'assistant/live-chunk') {
            return updateChunk(context.state, match.event.data.chunk, match.event.seq, match.event.time);
        }
        if (match.event.type === 'assistant/message')
            return settleMessage(context.state, match, match.event);
        if (match.event.type === 'assistant/attempt')
            return settleTiming(context.state, match.event);
        if (match.event.type === 'step/end')
            return { ...context.state, stepEnd: match };
        if (match.event.type !== 'llm/retry')
            return context.state;
        const data = match.event.data;
        const failure = displayFailure(data.failure);
        return {
            ...initialState(context.state.turn, context.state.step, context.state.startSeq, context.state.startTime, true),
            firstTokenTime: context.state.firstTokenTime,
            usage: context.state.usage,
            retry: {
                message: failure.message,
                ...(failure.code === undefined ? {} : { code: failure.code }),
                retry: data.retry,
                ...(data.mode === 'normal' ? { maxRetries: data.maxRetries } : {}),
                delayMs: data.delayMs,
            },
        };
    },
    publication: (match) => {
        if (match.event.type === 'step/start' || match.event.type === 'assistant/attempt')
            return 'none';
        if (match.event.type !== 'assistant/live-chunk')
            return 'immediate';
        const type = match.event.data.chunk.type;
        return type === 'usage' || type === 'finish' ? 'none' : 'animation-frame';
    },
    buildViewNode: (context) => {
        const state = context.state ?? fallbackState(context);
        if (state === undefined)
            return null;
        const node = finalNode(state, context);
        const boundary = closedBoundary(context);
        const partial = node === undefined && boundary === undefined && state.blocks.length > 0
            ? {
                turn: state.turn,
                step: state.step,
                blocks: compactBlocks(state.blocks),
                timing: {
                    stepStartTime: state.started ? state.startTime : null,
                    firstTokenTime: state.firstTokenTime ?? null,
                },
            }
            : null;
        const request = assistantRequest(state, node, boundary);
        if (node === undefined && partial === null && request === undefined)
            return null;
        return trajectoryNode(context, state.startSeq, {
            kind: 'assistant',
            ...(node === undefined ? {} : { node }),
            partial,
            ...(request === undefined ? {} : { request }),
        });
    },
};
const trajectoryTurnEndDefinition = {
    kind: 'trajectory-turn-end',
    target: 'trajectory',
    match: event => event.type === 'turn/end'
        ? { id: String(event.seq), role: 'start' }
        : null,
    start: (_context, match) => {
        if (match.event.type !== 'turn/end') {
            throw new Error('trajectory-turn-end start requires turn/end');
        }
        const reason = match.event.data.reason;
        const failure = reason.kind === 'error' ? displayFailure(reason.error) : undefined;
        return {
            turn: match.event.data.turn,
            seq: match.event.seq,
            time: match.event.time,
            ...(failure === undefined ? {} : {
                error: failure.message,
                ...(failure.code === undefined ? {} : { errorCode: failure.code }),
            }),
        };
    },
    update: context => context.state,
    buildViewNode: context => context.state === undefined
        ? null
        : trajectoryNode(context, context.state.seq, {
            kind: 'turn-end',
            turn: context.state.turn,
            time: context.state.time,
            ...(context.state.error === undefined ? {} : { error: context.state.error }),
            ...(context.state.errorCode === undefined ? {} : { errorCode: context.state.errorCode }),
        }),
};
/* jscpd:ignore-end */
/**
 * Register the Trajectory Assistant lifecycle.
 *
 * @param ctx - Plugin context receiving the Definitions.
 */
export function registerTrajectoryAssistantDefinition(ctx) {
    ctx.uiConversation.events.register(trajectoryAssistantDefinition);
    ctx.uiConversation.events.register(trajectoryTurnEndDefinition);
}
//# sourceMappingURL=trajectory-assistant-definition.js.map