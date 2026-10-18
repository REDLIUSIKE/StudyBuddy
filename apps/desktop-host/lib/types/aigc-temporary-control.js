import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { z } from 'zod';
const schema = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('open'), id: z.uuid(), systemPrompt: z.string().max(100000), tools: z.array(z.unknown()).max(128) }),
    z.strictObject({ action: z.literal('start'), id: z.uuid(), runId: z.uuid(), selection: z.strictObject({ provider: z.string().max(512), model: z.string().max(512), reasoningEffort: z.string().max(64).optional() }),
        prompt: z.string().min(1).max(100000), references: z.array(z.discriminatedUnion('dataType', [z.object({ dataType: z.literal('STRING'), value: z.string().max(1000000) }),
            z.object({ dataType: z.literal('IMAGE'), value: z.string().max(28_000_000) })])).max(32) }),
    z.strictObject({ action: z.literal('poll'), id: z.uuid(), runId: z.uuid(), cursor: z.number().int().nonnegative() }),
    z.strictObject({ action: z.literal('result'), id: z.uuid(), callId: z.uuid(), result: z.unknown() }),
    z.strictObject({ action: z.literal('control'), id: z.uuid(), control: z.enum(['pause', 'resume', 'stop', 'close']), runId: z.uuid().optional() }),
]);
export async function nativeTemporaryCommand(ctx, engine, parent, projectId, value, signal) {
    const input = schema.parse(value);
    signal.throwIfAborted();
    if (input.action === 'open')
        return engine.open(parent, projectId, { id: input.id, systemPrompt: input.systemPrompt, tools: input.tools });
    if (!engine.inProject(input.id, projectId))
        throw Error('AIGC_TEMPORARY_REVOKED');
    if (input.action === 'poll')
        return engine.poll(input.id, input.runId, input.cursor, signal);
    if (input.action === 'result') {
        engine.toolResult(input.id, input.callId, input.result);
        return null;
    }
    if (input.action === 'control')
        return engine.control(input.id, input.control, input.runId);
    const catalog = await ctx.sessionController.modelCatalog();
    if (!catalog.groups.some(group => group.id === input.selection.provider && group.models.some(model => model.id === input.selection.model)))
        throw Error('AIGC_MODEL_UNAVAILABLE');
    const content = [{ type: 'text', text: input.prompt }];
    for (const reference of input.references) {
        if (reference.dataType === 'STRING') {
            content.push({ type: 'text', text: reference.value });
            continue;
        }
        const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(reference.value);
        if (!match)
            throw Error('AIGC_REFERENCE_INVALID');
        const mediaType = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']).parse(match[1]);
        const attachments = await ctx.attachments.saveImages([{ data: Buffer.from(match[2], 'base64'), mediaType }]);
        if (attachments.length !== 1)
            throw Error('AIGC_REFERENCE_INVALID');
        content.push({ type: 'image', attachment: attachments[0] });
    }
    signal.throwIfAborted();
    await engine.start(input.id, input.runId, { provider: input.selection.provider, model: input.selection.model,
        ...(input.selection.reasoningEffort ? { reasoningEffort: ReasoningEffortId(input.selection.reasoningEffort) } : {}) }, content);
    return { started: true };
}
//# sourceMappingURL=aigc-temporary-control.js.map