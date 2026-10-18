import { brandString } from '@deepseek-ai/dsh-brand';
import { SessionId } from '@deepseek-ai/dsh-session';
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant';
import { createHash } from 'node:crypto';
/** Only existing native owners allocate data; retries use deterministic identities. */
export class SkillSafetyEntry {
    ctx;
    scope;
    pending = new Map();
    constructor(ctx, scope) {
        this.ctx = ctx;
        this.scope = scope;
    }
    /** Create/recover exactly one entry, then attach it to the retained feature project.
     * @param requestId - Stable accepted Labs entry id.
     * @returns The actual native identities, with no inference or scanner download. */
    beginSkillSafetySession(requestId) {
        const scope = this.scope();
        if (!scope || !requestId.trim() || requestId.length > 256)
            return Promise.reject(new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE'));
        const captured = { ...scope };
        const key = JSON.stringify([captured, requestId]), prior = this.pending.get(key);
        if (prior)
            return prior;
        if (this.pending.size >= 64)
            return Promise.reject(new SkillSafetyError('SKILL_SAFETY_JOURNAL_LIMIT'));
        const value = this.create(captured, requestId).finally(() => { if (this.pending.get(key) === value)
            this.pending.delete(key); });
        this.pending.set(key, value);
        return value;
    }
    async create(scope, requestId) {
        const current = () => { const active = this.scope(); if (active?.accountId !== scope.accountId || active.generation !== scope.generation)
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE'); };
        const project = await this.ctx.workspaceController.createProject({ requestId: brandString('studybuddy-skill-safety-project-v1'), title: '技能检查', sourceIds: [] });
        current();
        const digest = createHash('sha256').update(JSON.stringify([scope.accountId, requestId])).digest('hex');
        const sessionId = SessionId(`session-${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`);
        const session = await this.ctx.sessionController.create({ sessionId, workspaceId: project.workspace.workspaceId, agentPreset: 'skill-safety' });
        current();
        if (session.sessionId !== sessionId || session.agentPreset !== 'skill-safety' || this.ctx.sessions.get(sessionId)?.header.agentPreset !== 'skill-safety')
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
        return { workspaceId: project.workspace.workspaceId, sessionId };
    }
}
//# sourceMappingURL=skill-safety-entry.js.map