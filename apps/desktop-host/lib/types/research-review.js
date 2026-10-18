/** Opt-in reviews retain their original cadence/threshold and cannot review their own continuation. */
import { createHash } from 'node:crypto';
function settings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error('HARNESS_RESEARCH_REVIEW_SETTINGS_INVALID');
    const row = value;
    if (Object.keys(row).length !== 8 || Object.keys(row).some(key => !['enabled', 'model', 'thinking', 'cadenceEveryNTools', 'severityThreshold', 'children', 'watchdogMd', 'stalemateRepeats'].includes(key)) || typeof row.enabled !== 'boolean' || typeof row.model !== 'string' || row.model.length > 768 || typeof row.thinking !== 'string' || row.thinking.length > 128 || !(row.cadenceEveryNTools === null || Number.isSafeInteger(row.cadenceEveryNTools) && row.cadenceEveryNTools >= 5) || !['concern', 'blocker'].includes(row.severityThreshold) || typeof row.children !== 'boolean' || typeof row.watchdogMd !== 'boolean' || !Number.isSafeInteger(row.stalemateRepeats) || row.stalemateRepeats < 1 || row.stalemateRepeats > 20)
        throw Error('HARNESS_RESEARCH_REVIEW_SETTINGS_INVALID');
    return structuredClone(row);
}
function findings(text) {
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.findings) || parsed.findings.length > 32)
        throw Error('HARNESS_RESEARCH_REVIEW_RESULT_INVALID');
    return parsed.findings.map(value => { if (!value || typeof value !== 'object' || Object.keys(value).length !== 5 || !['concern', 'blocker'].includes(value.severity) || !['location', 'finding', 'evidence', 'fix'].every(key => typeof value[key] === 'string' && value[key].length <= 4096))
        throw Error('HARNESS_RESEARCH_REVIEW_RESULT_INVALID'); return structuredClone(value); });
}
/** One observed native event has one review identity; a transport/model failure remains stalled. */
export class NativeResearchReview {
    owner;
    context;
    instructions;
    settings;
    ledger = new Map();
    pending = new Map();
    previousFindings;
    repeats = 0;
    constructor(owner, context, value, instructions) {
        this.owner = owner;
        this.context = context;
        this.instructions = instructions;
        this.settings = settings(value);
        if (typeof instructions !== 'string' || instructions.length > 32768)
            throw Error('HARNESS_RESEARCH_REVIEW_SETTINGS_INVALID');
    }
    records() { return [...this.ledger.values()].map(value => structuredClone(value)); }
    current() { if (!this.owner.current(this.context))
        throw Error('HARNESS_RESEARCH_SCOPE_REVOKED'); }
    async observe(event) {
        this.current();
        if (!this.settings.enabled || !event.userTurn || event.child && !this.settings.children)
            return;
        if (event.kind === 'tool' && (this.settings.cadenceEveryNTools === null || !event.toolCount || event.toolCount % this.settings.cadenceEveryNTools !== 0))
            return;
        if (!Number.isSafeInteger(event.seq) || event.seq < 0 || !Number.isSafeInteger(event.turn) || event.turn < 1 || typeof event.snapshot !== 'string')
            throw Error('HARNESS_RESEARCH_REVIEW_EVENT_INVALID');
        const hash = createHash('sha256').update(JSON.stringify([this.context.scope.accountId, this.context.projectId, this.context.sessionId, event.turn, event.seq, event.kind])).digest('hex'), operationId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        const pending = this.pending.get(operationId);
        if (pending)
            return pending;
        if (this.ledger.has(operationId))
            return;
        const row = { operationId, sourceSeq: event.seq, sourceTurn: event.turn, sourceSha256: createHash('sha256').update(event.snapshot).digest('hex'), state: 'reviewing' };
        this.ledger.set(operationId, row);
        const work = this.run(row, event).finally(() => this.pending.delete(operationId));
        this.pending.set(operationId, work);
        await work;
    }
    async run(row, event) {
        try {
            await this.owner.persist?.(structuredClone(row));
            this.current();
            const result = await this.owner.run({ operationId: row.operationId, modelRef: this.settings.model || null, reasoningEffort: this.settings.thinking || null, sourceSeq: event.seq, sourceTurn: event.turn, standingInstructions: this.settings.watchdogMd ? this.instructions : '', snapshot: event.snapshot.slice(0, 32768) });
            this.current();
            if (typeof result.nativeSessionId !== 'string' || !result.nativeSessionId || typeof result.text !== 'string' || result.text.length > 131072)
                throw Error('HARNESS_RESEARCH_REVIEW_RESULT_INVALID');
            row.nativeSessionId = result.nativeSessionId;
            row.findings = findings(result.text);
            const hash = createHash('sha256').update(JSON.stringify(row.findings)).digest('hex');
            this.repeats = hash === this.previousFindings ? this.repeats + 1 : 1;
            this.previousFindings = hash;
            row.state = !row.findings.length ? 'clean' : this.repeats >= this.settings.stalemateRepeats ? 'stalemate' : 'completed';
            await this.owner.persist?.(structuredClone(row));
            this.current();
            const actionable = row.findings.filter(finding => this.settings.severityThreshold === 'concern' || finding.severity === 'blocker');
            if (actionable.length && row.state !== 'stalemate')
                await this.owner.deliver({ ...structuredClone(row), findings: actionable });
        }
        catch (error) {
            row.state = 'stalled';
            row.error = error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'HARNESS_RESEARCH_REVIEW_STALLED';
            if (this.owner.current(this.context))
                await this.owner.persist?.(structuredClone(row));
        }
    }
}
//# sourceMappingURL=research-review.js.map