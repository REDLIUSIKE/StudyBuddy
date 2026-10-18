import { SessionId } from '@deepseek-ai/dsh-session';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
export class NativeResearchConnectors {
    ctx;
    current;
    mounts = new Map();
    constructor(ctx, current) {
        this.ctx = ctx;
        this.current = current;
    }
    async mount(binding, value, actor) {
        if (value === undefined)
            return;
        const agent = actor ?? this.ctx.agents.get(SessionId(binding.sessionId));
        if (!agent || !this.current(binding))
            throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');
        if (actor && actor.id !== binding.sessionId && actor.session.header.parentSession !== binding.sessionId)
            throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');
        if (this.mounts.has(agent.id))
            return;
        if (!value || typeof value !== 'object' || !('connectors' in value) || !Array.isArray(value.connectors) || value.connectors.length > 128 || !('autoEnableCodemode' in value) || typeof value.autoEnableCodemode !== 'boolean')
            throw Error('HARNESS_RESEARCH_MCP_CATALOG_INVALID');
        const row = { projectId: binding.projectId, fibers: [], status: [], removeCode: undefined }, names = new Set();
        try {
            for (const source of value.connectors) {
                if (!source || typeof source !== 'object' || typeof source.name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(source.name) || names.has(source.name) || !['ready', 'disabled', 'unavailable'].includes(source.state))
                    throw Error('HARNESS_RESEARCH_MCP_CATALOG_INVALID');
                names.add(source.name);
                if (source.state !== 'ready') {
                    row.status.push({ name: source.name, state: source.state, ...(typeof source.reason === 'string' ? { reason: source.reason } : {}) });
                    continue;
                }
                let fiber;
                try {
                    const config = mcpClient.Config(source.config);
                    fiber = agent.ctx.plugin(mcpClient, config);
                    await fiber.await();
                    if (!this.current(binding))
                        throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');
                    row.fibers.push(fiber);
                    row.status.push({ name: source.name, state: 'ready' });
                }
                catch (error) {
                    await fiber?.dispose();
                    if (!this.current(binding))
                        throw error;
                    row.status.push({ name: source.name, state: 'unavailable', reason: 'NATIVE_MCP_CONNECTION_FAILED' });
                }
            }
            if (value.autoEnableCodemode && agent.ctx.get('ptcRuntime')) {
                const definition = agent.ctx.tools.codeTool('research_connector_code', exec => new Set(agent.ctx.tools.schemas(exec.agent).filter(schema => {
                    const tool = agent.ctx.tools.get(schema.name, exec.agent), source = tool && mcpClient.mcpToolMetadata(tool);
                    return source?.exposure === 'codemode' || source?.exposure === 'codemode-deferred';
                }).map(schema => schema.name)));
                row.removeCode = agent.ctx.tools.register(definition);
            }
            this.mounts.set(agent.id, row);
        }
        catch (error) {
            row.removeCode?.();
            for (const fiber of row.fibers.reverse())
                await fiber.dispose();
            throw error;
        }
    }
    status(sessionId) { return this.mounts.get(sessionId)?.status.map(row => ({ ...row })) ?? []; }
    async unmountSession(sessionId) {
        const row = this.mounts.get(sessionId);
        if (!row)
            return;
        row.removeCode?.();
        for (const fiber of row.fibers.reverse())
            await fiber.dispose();
        this.mounts.delete(sessionId);
    }
    async unmount(projectId) {
        for (const [id, row] of this.mounts)
            if (projectId === undefined || row.projectId === projectId) {
                await this.unmountSession(id);
            }
    }
}
//# sourceMappingURL=research-connectors.js.map