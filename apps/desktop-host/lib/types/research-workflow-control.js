import { SessionId } from '@deepseek-ai/dsh-session';
const invalid = () => { throw Error('HARNESS_RESEARCH_WORKFLOW_INPUT_INVALID'); };
function record(value) { if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid(); return value; }
/** Read exactly one workflow fence in the actual native reply which issued this tool call. */
export function replyWorkflowFromEvents(events, callId) {
    for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event.type !== 'assistant/message')
            continue;
        const content = event.data.message.content;
        if (!content.some(block => block.type === 'tool-call' && block.id === callId))
            continue;
        const sources = content.filter(block => block.type === 'tool-call' && ['research_workflow', 'research_schedule'].includes(block.name) && record(JSON.parse(block.arguments)).workflow === true);
        if (sources.length !== 1)
            return invalid();
        const text = content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n'), lines = text.split('\n'), scripts = [];
        let fence;
        for (let row = 0; row < lines.length; row++) {
            const line = lines[row].replace(/\r$/, '');
            if (!fence) {
                const open = /^(`{3,}|~{3,})/.exec(line);
                if (open)
                    fence = { marker: open[1], tagged: /^```(?:js|javascript) workflow[ \t]*$/.test(line), start: row + 1 };
                continue;
            }
            const close = /^(`{3,}|~{3,})[ \t]*$/.exec(line);
            if (!close || close[1][0] !== fence.marker[0] || close[1].length < fence.marker.length)
                continue;
            if (fence.tagged)
                scripts.push(lines.slice(fence.start, row).join('\n'));
            fence = undefined;
        }
        if (fence?.tagged || scripts.length !== 1 || !scripts[0].trim() || Buffer.byteLength(scripts[0]) > 65536)
            return invalid();
        return scripts[0];
    }
    throw Error('HARNESS_RESEARCH_WORKFLOW_REPLY_REQUIRED');
}
/** No renderer or model JSON chooses the native caller, model route or permission ceiling. */
export class NativeResearchWorkflowControl {
    ctx;
    advanced;
    host;
    constructor(ctx, advanced, host) {
        this.ctx = ctx;
        this.advanced = advanced;
        this.host = host;
    }
    async proveCaller(context, caller) {
        await this.advanced.freezeStart(context, { action: 'start', operationId: '11111111-1111-4111-8111-111111111111', label: 'Workflow source check', prompt: 'Read workflow source', persona: '', modelRef: null, reasoningEffort: null, tools: [], inheritParentContext: false, maxTokens: 1 }, caller);
        const agent = this.ctx.agents.get(SessionId(caller));
        if (!agent)
            throw Error('HARNESS_RESEARCH_CALLER_DENIED');
        return agent;
    }
    async command(context, value, caller = context.sessionId) {
        const input = record(value);
        if (input.action === 'for-caller') {
            if (caller !== context.sessionId || Object.keys(input).sort().join(',') !== 'action,callerSessionId,input' || typeof input.callerSessionId !== 'string')
                return invalid();
            await this.proveCaller(context, input.callerSessionId);
            return this.command(context, input.input, input.callerSessionId);
        }
        if (input.action === 'freeze-specialist') {
            if (Object.keys(input).sort().join(',') !== 'action,input')
                return invalid();
            return this.advanced.freezeStart(context, input.input, caller);
        }
        if (input.action === 'workflow-host') {
            if (Object.keys(input).sort().join(',') !== 'action,input' || !this.host)
                return invalid();
            return this.host.command(context, caller, input.input);
        }
        if (input.action === 'reply-workflow') {
            if (Object.keys(input).sort().join(',') !== 'action,callId' || typeof input.callId !== 'string' || input.callId.length > 192)
                return invalid();
            const agent = await this.proveCaller(context, caller);
            return { workflowScript: replyWorkflowFromEvents(agent.session.snapshotEvents(), input.callId) };
        }
        return this.advanced.commandForCaller(context, input, caller);
    }
    /** Recheck a prepared target before persisting a timer, retaining the exact definition bytes. */
    async freeze(context, value) {
        const envelope = record(value), target = record(envelope.target);
        if (Object.keys(envelope).sort().join(',') !== 'model,target,workflowScript' || typeof envelope.model !== 'string' || typeof envelope.workflowScript !== 'string' || target.rootSessionId !== context.sessionId || target.actorSessionId !== context.sessionId || target.workflowScript !== envelope.workflowScript)
            return invalid();
        const definitions = record(target.definitions);
        for (const definition of Object.values(definitions)) {
            const original = record(definition), resolved = await this.advanced.freezeStart(context, original);
            if (JSON.stringify(original) !== JSON.stringify(resolved))
                throw Error('HARNESS_RESEARCH_WORKFLOW_FROZEN_CHANGED');
        }
        return structuredClone(envelope);
    }
}
//# sourceMappingURL=research-workflow-control.js.map