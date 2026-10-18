/** Attributed native model combinations. Each component has a real native Session and ledger. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseHarnessResearchContextV1 } from '@studybuddy/contracts';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function componentId(operationId, index) { const hex = createHash('sha256').update(operationId + ':' + index).digest('hex'); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`; }
/** Intent persistence precedes dispatch; observing a saved unknown combination cannot resubmit it. */
export class NativeResearchCompositions {
    ctx;
    advanced;
    current;
    directory;
    rows = new Map();
    pending = new Map();
    constructor(ctx, advanced, current, directory) {
        this.ctx = ctx;
        this.advanced = advanced;
        this.current = current;
        this.directory = directory;
    }
    assert(context) { if (!this.current(context))
        throw Error('HARNESS_RESEARCH_SCOPE_REVOKED'); }
    file(context, id) { const root = this.directory(context); if (!path.isAbsolute(root) || fs.realpathSync(root) !== root)
        throw Error('HARNESS_RESEARCH_PATH_DENIED'); const folder = path.join(root, '.studybuddy', 'compositions'); for (const segment of [path.dirname(folder), folder]) {
        if (fs.existsSync(segment)) {
            const stat = fs.lstatSync(segment);
            if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(segment) !== segment)
                throw Error('HARNESS_RESEARCH_PATH_DENIED');
        }
        else
            fs.mkdirSync(segment, { mode: 0o700 });
    } const file = path.join(folder, id + '.json'); if (fs.existsSync(file) && (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 2097152))
        throw Error('HARNESS_RESEARCH_PATH_DENIED'); this.assert(context); return file; }
    save(row) { this.assert(row.context); const file = this.file(row.context, row.receipt.operationId), temporary = file + '.' + randomUUID() + '.tmp'; fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, context: row.context, signature: row.signature, receipt: row.receipt }) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file); }
    restore(context, id) {
        this.assert(context);
        if (!uuid.test(id))
            throw Error('HARNESS_RESEARCH_COMPOSITION_INVALID');
        const file = this.file(context, id);
        if (!fs.existsSync(file))
            return;
        const saved = JSON.parse(fs.readFileSync(file, 'utf8')), owner = parseHarnessResearchContextV1(saved.context), receipt = saved.receipt, input = JSON.parse(saved.signature);
        if (saved.schemaVersion !== 1 || owner.scope.accountId !== context.scope.accountId || owner.projectId !== context.projectId || owner.workspaceId !== context.workspaceId || owner.sessionId !== context.sessionId || input.action !== 'compose' || input.operationId !== id || !Array.isArray(input.models) || input.models.length < 1 || input.models.length > 8 || typeof input.judge !== 'string')
            throw Error('HARNESS_RESEARCH_OPERATION_CONFLICT');
        const valid = (component, index, modelRef) => component && component.operationId === componentId(id, index) && component.modelRef === modelRef && ['queued', 'running', 'completed', 'failed', 'unknown'].includes(component.state) && (component.nativeSessionId === undefined || component.nativeSessionId === 'session-' + component.operationId) && (component.text === undefined || typeof component.text === 'string' && component.text.length <= 131072);
        if (!receipt || receipt.operationId !== id || !['running', 'completed', 'failed', 'unknown', 'cancelled'].includes(receipt.state) || !Array.isArray(receipt.components) || receipt.components.length !== input.models.length || receipt.components.some((component, index) => !valid(component, String(index), input.models[index])) || receipt.judge !== undefined && !valid(receipt.judge, 'judge', input.judge) || typeof receipt.limitations !== 'string' || receipt.limitations.length > 2048 || receipt.error !== undefined && (typeof receipt.error !== 'string' || receipt.error.length > 512))
            throw Error('HARNESS_RESEARCH_RECEIPT_INVALID');
        const observed = structuredClone(receipt);
        if (observed.state === 'running') {
            observed.state = 'unknown';
            observed.error = 'HARNESS_RESEARCH_OUTCOME_UNCONFIRMED';
        }
        const row = { context: structuredClone(context), signature: saved.signature, receipt: observed, file, work: Promise.resolve(), cancelled: observed.state === 'cancelled' };
        this.assert(context);
        this.rows.set(id, row);
        return row;
    }
    async compose(context, value) {
        this.assert(context);
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw Error('HARNESS_RESEARCH_COMPOSITION_INVALID');
        const request = value;
        if (Object.keys(request).length !== 5 || Object.keys(request).some(key => !['action', 'operationId', 'prompt', 'models', 'judge'].includes(key)) || request.action !== 'compose' || typeof request.operationId !== 'string' || !uuid.test(request.operationId) || typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > 32768 || !Array.isArray(request.models) || request.models.length < 1 || request.models.length > 8 || !request.models.every(model => typeof model === 'string' && model.length < 768) || typeof request.judge !== 'string' || request.judge.length > 768)
            throw Error('HARNESS_RESEARCH_COMPOSITION_INVALID');
        const signature = JSON.stringify(request), owner = JSON.stringify(context), pending = this.pending.get(request.operationId);
        if (pending) {
            if (pending.signature !== signature || pending.owner !== owner)
                throw Error('HARNESS_RESEARCH_OPERATION_CONFLICT');
            return pending.value;
        }
        const existing = this.rows.get(request.operationId) ?? this.restore(context, request.operationId);
        if (existing) {
            if (existing.signature !== signature || JSON.stringify(existing.context) !== owner)
                throw Error('HARNESS_RESEARCH_OPERATION_CONFLICT');
            return structuredClone(existing.receipt);
        }
        const work = this.start(context, structuredClone(request), signature).finally(() => this.pending.delete(request.operationId));
        this.pending.set(request.operationId, { owner, signature, value: work });
        return work;
    }
    async start(context, request, signature) {
        const catalog = await this.ctx.sessionController.modelCatalog();
        this.assert(context);
        const choices = catalog.groups.flatMap(group => group.models.map(model => `${group.id}/${model.id}`));
        if ([...request.models, request.judge].some(model => choices.filter(choice => choice === model).length !== 1))
            throw Error('HARNESS_RESEARCH_MODEL_UNAVAILABLE');
        const file = this.file(context, request.operationId);
        if (fs.existsSync(file)) {
            const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (saved.schemaVersion !== 1 || saved.signature !== signature || JSON.stringify(saved.context) !== JSON.stringify(context))
                throw Error('HARNESS_RESEARCH_OPERATION_CONFLICT');
            if (saved.receipt?.state !== 'completed' && saved.receipt?.state !== 'failed')
                throw Error('HARNESS_RESEARCH_OUTCOME_UNCONFIRMED');
            return structuredClone(saved.receipt);
        }
        const receipt = { operationId: request.operationId, state: 'running', components: request.models.map((modelRef, index) => ({ modelRef, operationId: componentId(request.operationId, String(index)), state: 'queued' })), limitations: 'Tools-disabled model perspectives and synthesis, not independent scientific replications. No automatic provider/model fallback. Standalone OpenRouter server-side Fusion remains a separate protocol.' };
        const row = { context: structuredClone(context), signature, receipt, file, work: Promise.resolve(), cancelled: false };
        fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, context: row.context, signature, receipt }) + '\n', { flag: 'wx', mode: 0o600 });
        this.rows.set(request.operationId, row);
        row.work = this.run(row, request).catch(error => { receipt.state = row.cancelled ? 'cancelled' : 'unknown'; receipt.error = row.cancelled ? 'HARNESS_RESEARCH_CANCELLED' : error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'HARNESS_RESEARCH_COMPOSITION_UNKNOWN'; if (this.current(context))
            this.save(row); });
        return structuredClone(receipt);
    }
    async component(context, operationId, modelRef, prompt, label) {
        this.assert(context);
        await this.advanced.command(context, { action: 'start', operationId, label, prompt, persona: 'Provide an attributed scientific model perspective on supplied information. Keep observed sources, inference and unresolved claims distinct. You have no tools; do not invent experiments or web searches.', modelRef, reasoningEffort: null, tools: [], inheritParentContext: false, maxTokens: 4000 });
        await this.advanced.settled(operationId);
        this.assert(context);
        const result = await this.advanced.command(context, { action: 'inspect', operationId });
        return { state: result.state, nativeSessionId: result.nativeSessionId, ...(result.text === undefined ? {} : { text: result.text }) };
    }
    async run(row, request) {
        const { context, receipt } = row;
        for (const component of receipt.components) {
            if (row.cancelled)
                return;
            row.activeId = component.operationId;
            const result = await this.component(context, component.operationId, component.modelRef, request.prompt, 'fusion analysis');
            delete row.activeId;
            if (row.cancelled)
                return;
            Object.assign(component, result);
            this.save(row);
            if (component.state !== 'completed') {
                receipt.state = 'failed';
                receipt.error = 'HARNESS_RESEARCH_COMPOSITION_COMPONENT_FAILED';
                this.save(row);
                return;
            }
        }
        const judgeId = componentId(request.operationId, 'judge'), limit = Math.max(1024, Math.floor(24000 / receipt.components.length)), prompt = JSON.stringify({ question: request.prompt.slice(0, 16000), perspectives: receipt.components.map(({ modelRef, nativeSessionId, text }) => ({ modelRef, nativeSessionId, text: text?.slice(0, limit) })), limitations: 'Bounded model-opinion excerpts; full outputs remain in each native Session. They are not independent empirical replications. Preserve disagreements and unsupported claims.' });
        if (row.cancelled)
            return;
        row.activeId = judgeId;
        const judged = await this.component(context, judgeId, request.judge, prompt, 'fusion synthesis');
        delete row.activeId;
        if (row.cancelled)
            return;
        receipt.judge = { modelRef: request.judge, operationId: judgeId, ...judged };
        receipt.state = judged.state === 'completed' ? 'completed' : 'failed';
        this.save(row);
        if (receipt.state === 'completed') {
            const parent = this.ctx.agents.get(SessionId(context.sessionId));
            if (!parent)
                throw Error('HARNESS_RESEARCH_COMPOSITION_PARENT_UNAVAILABLE');
            const delivered = parent.session.snapshotEvents().some(event => event.type === 'user/message' && event.data.source.kind === 'research-composition' && event.data.source.operationId === receipt.operationId);
            if (!delivered)
                parent.followup(createUserMessage({ source: { kind: 'research-composition', operationId: receipt.operationId, nativeSessionIds: [...receipt.components.flatMap(component => component.nativeSessionId ? [component.nativeSessionId] : []), judged.nativeSessionId] }, content: [{ type: 'text', text: 'StudyBuddy 组合模型结果（模型观点与综合，非独立科研复现）：\n' + JSON.stringify({ operationId: receipt.operationId, judge: receipt.judge, components: receipt.components.map(({ modelRef, nativeSessionId, state }) => ({ modelRef, nativeSessionId, state })), limitations: receipt.limitations }) }] }));
        }
    }
    async settled(id) { await this.rows.get(id)?.work; }
    inspect(context, id) { this.assert(context); const row = this.rows.get(id) ?? this.restore(context, id); if (!row || JSON.stringify(row.context) !== JSON.stringify(context))
        throw Error('HARNESS_RESEARCH_RUN_NOT_FOUND'); return structuredClone(row.receipt); }
    async cancel(context, id) { this.assert(context); const row = this.rows.get(id) ?? this.restore(context, id); if (!row || JSON.stringify(row.context) !== JSON.stringify(context))
        throw Error('HARNESS_RESEARCH_RUN_NOT_FOUND'); if (row.receipt.state !== 'running')
        return structuredClone(row.receipt); row.cancelled = true; row.receipt.state = 'cancelled'; row.receipt.error = 'HARNESS_RESEARCH_CANCELLED'; this.save(row); if (row.activeId)
        await this.advanced.command(context, { action: 'cancel', operationId: row.activeId }); await row.work; this.assert(context); return structuredClone(row.receipt); }
    async close(projectId) { const rows = [...this.rows.values()].filter(row => projectId === undefined || row.context.projectId === projectId); for (const row of rows)
        row.cancelled = true; await Promise.all(rows.map(row => row.work)); for (const row of rows)
        if (this.rows.get(row.receipt.operationId) === row)
            this.rows.delete(row.receipt.operationId); }
}
//# sourceMappingURL=research-compositions.js.map