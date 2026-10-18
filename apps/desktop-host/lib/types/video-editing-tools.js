import { SessionId } from '@deepseek-ai/dsh-session';
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { videoToolDefinitions as definitions } from "./video-tool-descriptors.js";
const reads = new Set(['read', 'read_image', 'glob', 'grep', 'web_search', 'web_fetch', 'ask_user_question', 'list_agents', 'list_subagent_models', 'present']);
const videoRootId = /^session-video-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
/** Mount tools only on admitted native Sessions; keep restored video Sessions guarded. */
export class NativeVideoTools {
    ctx;
    port;
    mounts = new Map();
    constructor(ctx, port) {
        this.ctx = ctx;
        this.port = port;
        ctx.on('agent/pre-step', async ({ agent }, next) => {
            const root = this.owner(agent);
            if (root && !this.admitted(root) && root === agent.id)
                await this.ctx.get('capabilities')?.restoreOrigin?.(agent);
            if (root && !this.admitted(root))
                throw Error('VIDEO_PROJECT_NOT_OPEN');
            return next();
        }, { prepend: true });
        ctx.tools.guard(exec => {
            const root = exec.agent && this.owner(exec.agent);
            if (!root)
                return;
            if (!this.admitted(root))
                return 'The video project is no longer admitted.';
            return reads.has(exec.name) || !!exec.agent && !!this.ctx.get('capabilities')?.tools.permits(exec.agent, exec.name) || definitions.some(spec => spec.name === exec.name) ? undefined : 'Use the admitted video tools so a newer manual edit is not overwritten.';
        });
    }
    owner(agent) {
        let session = agent.session, reserved = false;
        const seen = new Set();
        for (;;) {
            const id = session.header.id;
            if (seen.has(id))
                break;
            seen.add(id);
            if (videoRootId.test(id))
                return id;
            reserved ||= id.startsWith('session-video-');
            const parent = session.header.parentSession;
            if (!parent)
                break;
            if (videoRootId.test(parent))
                return parent;
            const loaded = this.ctx.sessions.get(parent);
            if (!loaded)
                break;
            session = loaded;
        }
        return reserved ? agent.id : undefined;
    }
    admitted(id) { const mounted = this.mounts.get(id); return !!mounted && this.port.current(mounted.scope); }
    async mount(scope) {
        if (!videoRootId.test(scope.sessionId) || !this.port.current(scope))
            throw Error('VIDEO_SCOPE_REVOKED');
        const actor = this.ctx.agents.get(SessionId(scope.sessionId));
        if (!actor)
            throw Error('VIDEO_SESSION_UNAVAILABLE');
        this.mounts.get(scope.sessionId)?.dispose();
        const disposers = [];
        try {
            disposers.push(actor.ctx.tools.restrict({ allow: this.ctx.tools.schemas().filter(tool => reads.has(tool.name) || this.ctx.get('capabilities')?.tools.permits(actor, tool.name)).map(tool => tool.name) }));
            disposers.push(actor.ctx.systemPrompt.context({ name: 'studybuddy-video', order: 70, required: true, interpolate: false,
                text: 'You are editing the current StudyBuddy video project inside StudyBuddy. Use video_read_project for the current document, revision and Studio selection. Read video_read_guide before creating a film or a page animation. Use video_read_file and video_edit for all document changes; preserve the expected revision and re-read after a conflict. Private dot folders belong to the editor. Use video_look to inspect actual rendered frames and read_image to view its returned local files. Use the native media catalog and video_get with exact supported parameters and a stable UUIDv4; an unknown result must never be retried under a new request ID. The video_get description defines native input field names; video_media_choices supplies the allowed values. Execute the admitted video tools directly: generic subagent, shell, source-code inspection and configuration tools are not available for this project. Missing media or timing capability must be reported; never substitute a different model, CLI, key, unit or external service. Manual edits remain authoritative.' }));
            for (const spec of definitions) {
                disposers.push(actor.ctx.tools.register({ name: spec.name, description: spec.description, parameters: spec.parameters, output: { schema: spec.operation === 'mediaChoices' ? { type: 'array', items: { type: 'object', additionalProperties: true } } : spec.operation === 'mediaRequest' ? { oneOf: [{ type: 'object', additionalProperties: true }, { type: 'array', items: { type: 'object', additionalProperties: true } }] } : { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
                    presentCall: () => ({ card: 'generic', title: spec.name, kind: spec.operation.startsWith('read') ? 'read' : 'execute' }),
                    execute: async (input, exec) => {
                        if (!this.port.current(scope) || exec.agent?.id !== scope.sessionId)
                            throw Error('VIDEO_SCOPE_REVOKED');
                        if (validateJsonSchemaValue(spec.parameters, input, 'arguments').length)
                            throw Error('VIDEO_TOOL_ARGUMENTS_INVALID');
                        exec.signal.throwIfAborted();
                        const result = await this.port.invoke(scope, spec.operation, exec.callId, input, exec.signal);
                        if (!this.port.current(scope))
                            throw Error('VIDEO_SCOPE_REVOKED');
                        return result;
                    } }));
            }
        }
        catch (error) {
            for (const dispose of disposers.reverse())
                dispose();
            throw error;
        }
        const dispose = () => { for (const remove of disposers.splice(0).reverse())
            remove(); };
        this.mounts.set(scope.sessionId, { scope, dispose });
    }
    /** Remove one project's tools or all owned contributions.
     * @param sessionId - Native Session to remove; omission clears this controller.
     * @returns Completion after synchronous registry and listener disposal. */
    async unmount(sessionId) {
        for (const [id, mounted] of [...this.mounts])
            if (sessionId === undefined || sessionId === id) {
                this.mounts.delete(id);
                mounted.dispose();
            }
    }
}
//# sourceMappingURL=video-editing-tools.js.map