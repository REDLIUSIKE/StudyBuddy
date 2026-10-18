/** Cumulative mission Token limits around each mission's native child Goal driver. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { appendDelegatedPolicyOverrides, applyChildComposition, assertSubagentMaxDepth, captureDelegatedPolicyOverrides, childSessionMeta, resolveChildAgentOptions, resolveChildDepth, snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent';
import { isAgentLoopRequest, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { parseHarnessResearchContextV1 } from '@studybuddy/contracts';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const phases = ['active', 'paused', 'budget-exhausted', 'complete', 'cancelled', 'disabled', 'unknown'];
const terminal = (state) => state === 'complete' || state === 'cancelled' || state === 'disabled';
const integer = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined; }
function identity(context) { return JSON.stringify([context.scope.accountId, context.projectId, context.workspaceId, context.sessionId]); }
function goalSessionId(context, missionId) {
    const bytes = createHash('sha256').update(JSON.stringify(['research-goal', context.scope.accountId, context.projectId, missionId])).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = bytes.toString('hex');
    return 'session-' + [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
function frozen(value) {
    const row = record(value);
    if (!row || typeof row.modelRef !== 'string' || !/^[^/]+\/.+/.test(row.modelRef) || row.modelRef.length > 768 || !(row.reasoningEffort === null || typeof row.reasoningEffort === 'string' && row.reasoningEffort.length < 128) || !Array.isArray(row.tools) || row.tools.length > 256 || row.tools.some(name => typeof name !== 'string' || !name || name.length > 256) || new Set(row.tools).size !== row.tools.length || !integer(row.maxTokens) || row.maxTokens < 1 || row.maxTokens > 32768)
        throw Error('HARNESS_RESEARCH_GOAL_COMPOSITION_INVALID');
    return { modelRef: row.modelRef, reasoningEffort: row.reasoningEffort, tools: [...row.tools], maxTokens: row.maxTokens };
}
function parseSync(value) {
    const row = record(value);
    if (row?.action === 'inspect' && Object.keys(row).length === 2 && typeof row.missionId === 'string' && uuid.test(row.missionId))
        return { action: 'inspect', missionId: row.missionId };
    if (!row || row.action !== 'sync' || Object.keys(row).length !== 7 || Object.keys(row).some(key => !['action', 'missionId', 'objective', 'tokenBudget', 'state', 'explicit', 'callId'].includes(key)) || typeof row.missionId !== 'string' || !uuid.test(row.missionId) || typeof row.objective !== 'string' || !row.objective.trim() || row.objective.length > 65536 || !integer(row.tokenBudget) || row.tokenBudget < 1 || typeof row.state !== 'string' || !['active', 'paused', 'complete', 'cancelled', 'disabled'].includes(row.state) || typeof row.explicit !== 'boolean' || typeof row.callId !== 'string' || !row.callId || row.callId.length > 512)
        throw Error('HARNESS_RESEARCH_GOAL_INPUT_INVALID');
    return { action: 'sync', missionId: row.missionId, objective: row.objective.trim(), tokenBudget: row.tokenBudget, state: row.state, explicit: row.explicit, callId: row.callId };
}
/** Preserve an exact adapter total; reasoning is already included in output. */
function trustedTotal(event) {
    const usage = event.data.usage, last = event.data.stream.at(-1);
    if (event.data.interrupted || !usage || last?.type !== 'chunk' || last.chunk.type !== 'finish' || !['stop', 'max-tokens'].includes(last.chunk.reason.kind))
        return;
    if (![usage.inputTokens, usage.outputTokens, usage.totalTokens, usage.cacheReadTokens ?? 0, usage.cacheWriteTokens ?? 0, usage.reasoningTokens ?? 0].every(integer))
        return;
    const sum = usage.inputTokens + usage.outputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
    if (!Number.isSafeInteger(sum) || sum !== usage.totalTokens || (usage.reasoningTokens ?? 0) > usage.outputTokens)
        return;
    return usage.totalTokens;
}
/** Persist each request before dispatch and account only canonical terminal Session events. */
export class NativeResearchGoals {
    ctx;
    options;
    rows = new Map();
    handles = new Map();
    commands = new Map();
    dispose = [];
    blocking = new Set();
    grants = new Map();
    constructor(ctx, options) {
        this.ctx = ctx;
        this.options = options;
        this.dispose.push(ctx.on('agent/created', ({ agent }) => {
            for (const row of this.rows.values()) {
                if (terminal(row.state) || row.members.some(member => member.sessionId === agent.id))
                    continue;
                const parent = row.members.find(member => member.sessionId === agent.session.header.parentSession);
                if (!parent)
                    continue;
                const owner = ctx.agents.get(SessionId(parent.sessionId));
                if (!owner || !ctx.agents.isOwnedBy(agent.id, owner))
                    throw Error('HARNESS_RESEARCH_GOAL_LINEAGE_DENIED');
                this.assert(row.context);
                this.prove(row, agent.session);
                row.members.push({ sessionId: agent.id, parentSessionId: parent.sessionId, fromSeq: -1, throughSeq: -1, tokensUsed: 0 });
                this.save(row);
            }
        }));
        this.dispose.push(ctx.on('session/event', (session, event) => {
            for (const row of this.rows.values())
                if (row.members.some(member => member.sessionId === session.id)) {
                    try {
                        this.observe(row, session, event);
                    }
                    catch (error) {
                        row.fault = error instanceof Error ? error.message : String(error);
                        this.block(row);
                        ctx.logger.warn('Research Goal accounting stopped: ' + row.fault);
                    }
                }
        }));
        this.dispose.push(ctx.on('agent/pre-step', async ({ agent }, next) => {
            const decision = await next(), row = this.forSession(agent.id);
            if (!row || decision.kind === 'reject')
                return decision;
            this.assert(row.context);
            this.prove(row, agent.session);
            if (!this.allowed(row)) {
                this.block(row);
                return { kind: 'reject' };
            }
            return decision;
        }, { prepend: true }));
        const owner = this;
        this.dispose.push(ctx.on('llm/stream', async function* (request, next) {
            const row = request.sessionId === undefined ? undefined : owner.forSession(request.sessionId);
            if (!row) {
                yield* next();
                return;
            }
            owner.assert(row.context);
            const agent = owner.ctx.agents.get(SessionId(request.sessionId));
            if (!agent || !isAgentLoopRequest(request))
                throw Error('HARNESS_RESEARCH_GOAL_REQUEST_DENIED');
            owner.prove(row, agent.session);
            if (!owner.allowed(row)) {
                owner.block(row);
                throw new LlmError('Research Goal budget or usage prevents a new request.', 'HARNESS_RESEARCH_GOAL_DISPATCH_DENIED');
            }
            const member = row.members.find(member => member.sessionId === agent.id);
            if (member.pending) {
                owner.unknown(row, `${agent.id}:pending:${member.pending.afterSeq}`);
                throw Error('HARNESS_RESEARCH_GOAL_USAGE_UNCONFIRMED');
            }
            const events = agent.session.snapshotEvents(), step = events.findLast(event => event.type === 'step/start');
            if (step?.type !== 'step/start')
                throw Error('HARNESS_RESEARCH_GOAL_REQUEST_DENIED');
            member.pending = { afterSeq: Number(events.at(-1)?.seq ?? -1), turn: step.data.turn, step: step.data.step };
            owner.save(row);
            let finished = false;
            try {
                for await (const chunk of next()) {
                    if (chunk.type === 'finish' && ['stop', 'max-tokens'].includes(chunk.reason.kind))
                        finished = true;
                    yield chunk;
                }
            }
            finally {
                if (!finished && member.pending)
                    owner.unknown(row, `${agent.id}:pending:${member.pending.afterSeq}`);
            }
        }, { prepend: true }));
        this.dispose.push(ctx.on('agent/request-error', async ({ agent }, next) => { const result = await next(); return this.forSession(agent.id) ? undefined : result; }, { prepend: true }));
        this.dispose.push(ctx.on('goal/changed', ({ agent, change }) => {
            const id = change.ref.id;
            const row = [...this.rows.values()].find(row => row.goalSessionId === agent.id && row.goalId === id);
            if (!row || terminal(row.state))
                return;
            this.assert(row.context);
            if (change.operation === 'clear')
                row.state = 'disabled';
            else if (change.goal?.phase === 'complete')
                row.state = 'complete';
            else if (change.goal?.phase === 'paused')
                row.state = row.unknownRequests.length ? 'unknown' : row.tokensUsed >= row.tokenBudget ? 'budget-exhausted' : 'paused';
            else if (change.goal?.phase === 'blocked')
                row.state = row.unknownRequests.length ? 'unknown' : row.tokensUsed >= row.tokenBudget ? 'budget-exhausted' : 'paused';
            else if (change.operation === 'resume')
                row.state = row.unknownRequests.length ? 'unknown' : row.tokensUsed >= row.tokenBudget ? 'budget-exhausted' : 'active';
            this.save(row);
            if (!this.allowed(row) && !terminal(row.state) && change.operation === 'resume')
                this.block(row);
        }));
    }
    assert(context) { if (!this.options.current(context))
        throw Error('HARNESS_RESEARCH_SCOPE_REVOKED'); }
    key(context, missionId) { return identity(context) + ':' + missionId; }
    requireGrant(context, request) {
        const grant = this.grants.get(identity(context) + ':' + request.callId);
        if (!grant || grant.missionId !== undefined && grant.missionId !== request.missionId || grant.tokenBudget !== undefined && grant.tokenBudget !== request.tokenBudget)
            throw Error('HARNESS_RESEARCH_GOAL_AUTHORITY_REQUIRED');
    }
    /** Attest an actual mission tool call using the native Goal tools' direct-human policy.
     * @param context - Current project binding captured by the native tool registrar.
     * @param exec - Registry-owned execution, with its actual calling root Agent and call id.
     * @param input - The original mission arguments; no JSON flag alone creates authority.
     * @returns A disposer to revoke the grant when that exact RPC finishes. */
    authorizeMission(context, exec, input) {
        this.assert(context);
        const action = record(input), mission = record(action?.action === 'mission.create' ? action.mission : action?.action === 'mission.update' ? action.missionUpdate : undefined);
        if (!mission || mission.goal === undefined && mission.budget === undefined && mission.objective === undefined)
            return () => { };
        const agent = exec.agent;
        if (!agent || this.ctx.agents.get(agent.id) !== agent || agent.id !== context.sessionId || agent.status !== 'running' || this.ctx.agents.currentInitiator() !== agent || !this.ctx.agents.roots().includes(agent))
            throw Error('HARNESS_RESEARCH_GOAL_AUTHORITY_REQUIRED');
        const events = agent.session.snapshotEvents(), boundary = this.ctx.sessionProjections.stateOf(agent.session, 'turnBoundary');
        if (boundary?.openTurnStartSeq === null || boundary?.openTurnStartSeq === undefined || !events.some(event => event.seq > boundary.openTurnStartSeq && event.type === 'user/message' && event.data.source.kind === 'user'))
            throw Error('HARNESS_RESEARCH_GOAL_AUTHORITY_REQUIRED');
        const budget = record(mission.budget), key = identity(context) + ':' + exec.callId, signature = JSON.stringify(input);
        const previous = this.grants.get(key);
        if (previous && previous.signature !== signature)
            throw Error('HARNESS_RESEARCH_OPERATION_CONFLICT');
        const grant = { signature, projectId: context.projectId, ...(typeof action?.missionId === 'string' ? { missionId: action.missionId } : {}), ...(integer(budget?.tokens) ? { tokenBudget: budget.tokens } : {}) };
        this.grants.set(key, grant);
        return () => { if (this.grants.get(key) === grant)
            this.grants.delete(key); };
    }
    forSession(sessionId) { return [...this.rows.values()].find(row => row.members.some(member => member.sessionId === sessionId)); }
    directory(context) {
        this.assert(context);
        const root = this.options.directory(context);
        if (!path.isAbsolute(root) || fs.realpathSync(root) !== root)
            throw Error('HARNESS_RESEARCH_PATH_DENIED');
        for (const folder of [path.join(root, '.studybuddy'), path.join(root, '.studybuddy', 'native-goals')]) {
            try {
                const stat = fs.lstatSync(folder);
                if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(folder) !== folder)
                    throw Error('HARNESS_RESEARCH_PATH_DENIED');
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    throw error;
                fs.mkdirSync(folder, { mode: 0o700 });
            }
        }
        return path.join(root, '.studybuddy', 'native-goals');
    }
    save(row) {
        this.assert(row.context);
        this.directory(row.context);
        const { file, fault: _fault, ...saved } = row, temporary = file + '.' + randomUUID() + '.tmp';
        fs.writeFileSync(temporary, JSON.stringify(saved) + '\n', { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, file);
    }
    prove(row, session) {
        if (session.header.cwd !== this.options.directory(row.context))
            throw Error('HARNESS_RESEARCH_GOAL_LINEAGE_DENIED');
        const own = row.members.find(member => member.sessionId === session.id);
        // agent/created runs before the newly discovered member is recorded.
        if (own && session.header.parentSession !== own.parentSessionId)
            throw Error('HARNESS_RESEARCH_GOAL_LINEAGE_DENIED');
        const live = this.ctx.agents.get(SessionId(session.id)), liveParent = session.header.parentSession ? this.ctx.agents.get(session.header.parentSession) : undefined;
        if (live && (!liveParent || !this.ctx.agents.isOwnedBy(live.id, liveParent)))
            throw Error('HARNESS_RESEARCH_GOAL_LINEAGE_DENIED');
        let id = session.id, parent = session.header.parentSession;
        const seen = new Set();
        while (id !== row.context.sessionId) {
            if (seen.has(id) || !parent)
                throw Error('HARNESS_RESEARCH_GOAL_LINEAGE_DENIED');
            seen.add(id);
            if (id === row.goalSessionId) {
                if (parent !== row.context.sessionId)
                    throw Error('HARNESS_RESEARCH_GOAL_LINEAGE_DENIED');
                id = parent;
                continue;
            }
            const known = row.members.find(member => member.sessionId === parent);
            if (!known)
                throw Error('HARNESS_RESEARCH_GOAL_LINEAGE_DENIED');
            id = known.sessionId;
            parent = known.parentSessionId ?? undefined;
        }
    }
    allowed(row) { return !row.fault && row.admission === 'ready' && row.state === 'active' && row.tokensUsed < row.tokenBudget && row.unknownRequests.length === 0; }
    block(row) {
        if (this.blocking.has(row))
            return;
        this.blocking.add(row);
        queueMicrotask(() => {
            this.blocking.delete(row);
            if (!this.options.current(row.context) || ![...this.rows.values()].includes(row))
                return;
            try {
                this.blockNow(row);
            }
            catch (error) {
                row.fault = error instanceof Error ? error.message : String(error);
                this.ctx.logger.warn('Research Goal continuation could not be blocked: ' + row.fault);
            }
        });
    }
    blockNow(row) {
        const agent = this.ctx.agents.get(SessionId(row.goalSessionId));
        if (!agent)
            return;
        const goal = this.ctx.goals.get(agent);
        if (!goal || goal.id !== row.goalId || goal.phase !== 'active')
            return;
        const unconfirmed = row.fault || row.unknownRequests.length > 0 || row.admission !== 'ready';
        this.ctx.goals.block(agent, { id: goal.id, revision: goal.revision }, { code: unconfirmed ? 'research-usage-unconfirmed' : 'research-token-limit', message: unconfirmed ? 'Research Goal usage is unconfirmed; reconcile the canonical requests before continuing.' : `Research Goal reached its cumulative ${row.tokenBudget} Token budget.` });
    }
    unknown(row, requestId) {
        if (!row.unknownRequests.includes(requestId))
            row.unknownRequests.push(requestId);
        if (!terminal(row.state))
            row.state = 'unknown';
        this.save(row);
        this.block(row);
    }
    observe(row, session, event) {
        this.assert(row.context);
        this.prove(row, session);
        const member = row.members.find(member => member.sessionId === session.id);
        if (terminal(row.state) && !member.pending)
            return;
        if (event.seq <= member.throughSeq || event.type !== 'assistant/message' && event.type !== 'assistant/attempt')
            return;
        const start = session.snapshotEvents().findLast(candidate => candidate.type === 'step/start' && candidate.seq < event.seq && candidate.data.turn === event.data.turn && candidate.data.step === event.data.step);
        const pending = member.pending;
        if (!pending && (!start || start.seq <= member.fromSeq))
            return;
        if (pending && event.seq <= pending.afterSeq)
            return;
        if (pending && (event.data.turn !== pending.turn || event.data.step !== pending.step))
            throw Error('HARNESS_RESEARCH_GOAL_REQUEST_IDENTITY_INVALID');
        member.throughSeq = Number(event.seq);
        if (pending)
            row.unknownRequests = row.unknownRequests.filter(id => id !== `${session.id}:pending:${pending.afterSeq}`);
        delete member.pending;
        const total = event.type === 'assistant/message' ? trustedTotal(event) : undefined;
        if (total === undefined) {
            this.unknown(row, `${session.id}:${event.seq}`);
            return;
        }
        if (!Number.isSafeInteger(row.tokensUsed + total)) {
            this.unknown(row, `${session.id}:${event.seq}`);
            return;
        }
        row.tokensUsed += total;
        member.tokensUsed += total;
        if (!terminal(row.state) && row.unknownRequests.length === 0)
            row.state = row.tokensUsed >= row.tokenBudget ? 'budget-exhausted' : row.state === 'unknown' ? 'paused' : row.state;
        this.save(row);
        if (!this.allowed(row) && !terminal(row.state))
            this.block(row);
    }
    decode(context, file) {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576)
            throw Error('HARNESS_RESEARCH_GOAL_RECEIPT_INVALID');
        const saved = JSON.parse(fs.readFileSync(file, 'utf8')), value = record(saved);
        if (!value)
            throw Error('HARNESS_RESEARCH_GOAL_RECEIPT_INVALID');
        const owner = parseHarnessResearchContextV1(value.context);
        if (identity(owner) !== identity(context))
            throw Error('HARNESS_RESEARCH_GOAL_NOT_FOUND');
        if (value.schemaVersion !== 1 || typeof value.missionId !== 'string' || !uuid.test(value.missionId) || path.basename(file) !== value.missionId + '.json' || typeof value.objective !== 'string' || !value.objective.trim() || !integer(value.tokenBudget) || value.tokenBudget < 1 || !integer(value.tokensUsed) || typeof value.state !== 'string' || !phases.includes(value.state) || !['admitting', 'ready'].includes(String(value.admission)) || value.goalId !== undefined && (typeof value.goalId !== 'string' || !value.goalId.startsWith('goal-')) || !Array.isArray(value.members) || !value.members.length || value.members.length > 1000 || !Array.isArray(value.unknownRequests) || value.unknownRequests.length > 1000 || value.unknownRequests.some(id => typeof id !== 'string') || new Set(value.unknownRequests).size !== value.unknownRequests.length)
            throw Error('HARNESS_RESEARCH_GOAL_RECEIPT_INVALID');
        const members = value.members.map((item) => {
            const member = record(item), pending = member?.pending === undefined ? undefined : record(member.pending);
            if (!member || typeof member.sessionId !== 'string' || !(member.parentSessionId === null || typeof member.parentSessionId === 'string') || !Number.isSafeInteger(member.fromSeq) || Number(member.fromSeq) < -1 || !Number.isSafeInteger(member.throughSeq) || Number(member.throughSeq) < Number(member.fromSeq) || !integer(member.tokensUsed) || member.pending !== undefined && (!pending || !integer(pending.afterSeq) || !integer(pending.turn) || !integer(pending.step)))
                throw Error('HARNESS_RESEARCH_GOAL_RECEIPT_INVALID');
            return { sessionId: member.sessionId, parentSessionId: member.parentSessionId, fromSeq: Number(member.fromSeq), throughSeq: Number(member.throughSeq), tokensUsed: member.tokensUsed, ...(pending ? { pending: { afterSeq: Number(pending.afterSeq), turn: Number(pending.turn), step: Number(pending.step) } } : {}) };
        });
        const childId = goalSessionId(context, value.missionId);
        if (value.goalSessionId !== childId || new Set(members.map(member => member.sessionId)).size !== members.length || members[0].sessionId !== childId || members[0].parentSessionId !== context.sessionId || members.some((member, index) => index > 0 && !members.slice(0, index).some(parent => parent.sessionId === member.parentSessionId)) || members.reduce((sum, member) => sum + member.tokensUsed, 0) !== value.tokensUsed)
            throw Error('HARNESS_RESEARCH_GOAL_RECEIPT_INVALID');
        const row = { schemaVersion: 1, context: structuredClone(context), missionId: value.missionId, goalSessionId: childId, frozen: frozen(value.frozen), objective: value.objective, tokenBudget: value.tokenBudget, tokensUsed: value.tokensUsed, state: value.state, admission: value.admission, ...(typeof value.goalId === 'string' ? { goalId: value.goalId } : {}), members, unknownRequests: value.unknownRequests, file };
        return row;
    }
    /** Restore counters on project binding; restart never arms or replays a paid Goal start.
     * @param context - Current admitted project and root Session.
     * @returns Resolves after persisted requests have been reconciled. */
    async mount(context) {
        this.assert(context);
        const directory = this.directory(context), entries = fs.readdirSync(directory);
        if (entries.length > 1000)
            throw Error('HARNESS_RESEARCH_GOAL_STORE_LIMIT');
        for (const entry of entries.filter(entry => uuid.test(entry.slice(0, -5)) && entry.endsWith('.json'))) {
            const id = entry.slice(0, -5), key = this.key(context, id);
            if (this.rows.has(key))
                continue;
            let row;
            try {
                row = this.decode(context, path.join(directory, entry));
            }
            catch (error) {
                if (error.message === 'HARNESS_RESEARCH_GOAL_NOT_FOUND')
                    continue;
                throw error;
            }
            this.rows.set(key, row);
            const child = this.ctx.agents.get(SessionId(row.goalSessionId));
            if (child && this.ctx.goals.get(child)?.id === row.goalId)
                this.ctx.goals.disarm(child);
            for (const member of row.members) {
                const live = this.ctx.sessions.get(SessionId(member.sessionId)), query = this.ctx.get('sessionQuery');
                const stored = !live && query ? await query.readSession(SessionId(member.sessionId)) : undefined;
                this.assert(context);
                const snapshot = live ? { session: live, events: live.snapshotEvents() } : stored ? { session: { id: stored.session.id, header: stored.session, snapshotEvents: () => stored.events }, events: stored.events } : undefined;
                if (snapshot)
                    for (const event of snapshot.events)
                        this.observe(row, snapshot.session, event);
                if (member.pending)
                    this.unknown(row, `${member.sessionId}:pending:${member.pending.afterSeq}`);
            }
            if (row.admission !== 'ready')
                this.unknown(row, `${row.goalSessionId}:goal-admission`);
            if (row.state === 'active') {
                row.state = 'paused';
                this.save(row);
            }
        }
    }
    view(row) {
        const agent = this.ctx.agents.get(SessionId(row.goalSessionId)), goal = agent ? this.ctx.goals.get(agent) : undefined;
        return { missionId: row.missionId, nativeSessionId: row.context.sessionId, goalSessionId: row.goalSessionId, goalId: row.goalId ?? null, state: row.state, tokenBudget: row.tokenBudget, tokensUsed: row.tokensUsed, unknownRequests: [...row.unknownRequests], ...(row.fault ? { accountingError: row.fault } : {}), activation: goal !== undefined && goal.id === row.goalId ? goal.activation : 'disarmed', sessions: row.members.map(member => ({ sessionId: member.sessionId, parentSessionId: member.parentSessionId, tokensUsed: member.tokensUsed })) };
    }
    /** Compose an owned native conversation without injecting a human prompt or a second runner. */
    async child(row, parent, fresh) {
        this.assert(row.context);
        const service = this.ctx.get('subagents'), provider = service?.getProvider('spawn');
        if (!service || !provider?.prepareContinuable || provider.inheritsParentContext !== false || !provider.capabilities.agentOptions || !provider.capabilities.toolFilter || !provider.capabilities.depthLimit)
            throw Error('HARNESS_RESEARCH_SUBAGENTS_UNAVAILABLE');
        const maxDepth = service.resolveMaxDepth(this.options.maxDepth);
        assertSubagentMaxDepth(maxDepth);
        const depth = resolveChildDepth(parent, maxDepth), slash = row.frozen.modelRef.indexOf('/');
        const selection = { provider: row.frozen.modelRef.slice(0, slash), model: row.frozen.modelRef.slice(slash + 1), ...(row.frozen.reasoningEffort === null ? {} : { reasoningEffort: ReasoningEffortId(row.frozen.reasoningEffort) }), maxTokens: row.frozen.maxTokens };
        const globalTools = row.frozen.tools.filter(name => name !== 'run_code' && this.ctx.tools.get(name) !== undefined);
        const descriptor = snapshotSubagentDescriptor({ mode: 'continuable', provider: provider.name, label: 'Continuous research mission', agentProvider: selection.provider, agentModel: selection.model, ...(selection.reasoningEffort === undefined ? {} : { agentReasoningEffort: selection.reasoningEffort }), toolFilter: { allow: globalTools } });
        const live = this.ctx.agents.get(SessionId(row.goalSessionId));
        if (live) {
            if (fresh || !this.handles.has(row.goalSessionId))
                throw Error('HARNESS_RESEARCH_GOAL_SESSION_DENIED');
            this.prove(row, live.session);
            return live;
        }
        const policies = captureDelegatedPolicyOverrides(parent), signal = new AbortController().signal;
        const prepared = fresh ? await provider.prepareContinuable({ sessionId: SessionId(row.goalSessionId), cwd: this.options.directory(row.context), parent, signal }) : undefined;
        this.assert(row.context);
        if (prepared?.seed !== undefined)
            throw Error('HARNESS_RESEARCH_GOAL_COMPOSITION_INVALID');
        const setup = async (childCtx, child) => {
            if (fresh) {
                child.session.append('subagent/descriptor', descriptor);
                appendDelegatedPolicyOverrides(child.session, policies);
                const workingDirectory = childCtx.get('workingDirectory');
                if (!workingDirectory)
                    throw Error('HARNESS_RESEARCH_GOAL_COMPOSITION_INVALID');
                await workingDirectory.set(child, this.options.directory(row.context), signal);
            }
            else {
                this.prove(row, child.session);
                const recorded = child.session.snapshotEvents().find(event => event.type === 'subagent/descriptor');
                if (recorded?.type !== 'subagent/descriptor' || JSON.stringify(recorded.data) !== JSON.stringify(descriptor))
                    throw Error('HARNESS_RESEARCH_GOAL_COMPOSITION_INVALID');
                const goal = this.ctx.sessionProjections.stateOf(child.session, 'goal')?.current?.goal;
                if (!goal || goal.id !== row.goalId)
                    throw Error('HARNESS_RESEARCH_GOAL_IDENTITY_DENIED');
            }
            applyChildComposition(childCtx, parent, { toolFilter: { allow: globalTools } });
            await this.options.composeChild?.(row.context, child);
            for (const name of row.frozen.tools) {
                const definition = parent.ctx.tools.get(name, parent);
                if (definition && !childCtx.tools.get(name, child))
                    childCtx.tools.register(definition);
            }
            installModelSelection(childCtx, { current: selection, assembled: undefined }, { requireSelection: true });
            const allowed = new Set(row.frozen.tools);
            childCtx.tools.guard(exec => !this.options.current(row.context) ? 'Research ownership has expired.' : allowed.has(exec.name) ? undefined : 'This capability was outside the mission creation-time ceiling.');
            childCtx.on('system-prompt/assemble', async (_assembly, _context, next) => { const assembled = await next(); return { ...assembled, tools: assembled.tools.filter(tool => allowed.has(tool.name)) }; }, { prepend: true });
            // Mutable scope and root identity are rechecked at the native publication boundary.
            return { commit: () => { this.assert(row.context); if (this.rows.get(this.key(row.context, row.missionId)) !== row || this.ctx.agents.get(parent.id) !== parent || parent.id !== row.context.sessionId || !this.ctx.agents.roots().includes(parent) || parent.session.header.cwd !== this.options.directory(row.context))
                    throw Error('HARNESS_RESEARCH_GOAL_SESSION_DENIED'); } };
        };
        const agentOptions = resolveChildAgentOptions(parent, selection, depth);
        const handle = fresh ? await this.ctx.agents.create({ sessionId: SessionId(row.goalSessionId), parentAgent: parent, meta: childSessionMeta(parent, depth, false), agentOptions, signal, setup }) : await this.ctx.agents.resume({ resumeSessionId: SessionId(row.goalSessionId), parentAgent: parent, agentOptions, signal, setup });
        this.handles.set(row.goalSessionId, handle);
        this.assert(row.context);
        if (fresh)
            parent.session.append('subagent/catalog', { version: 0, childId: handle.agent.id, childCreatedAt: handle.agent.session.header.createdAt, mode: 'continuable', label: descriptor.label });
        return handle.agent;
    }
    /** Apply an authored mission setting or inspect its persisted accounting.
     * @param context - Admitted account, project and root Session.
     * @param value - Closed mission Goal command from the private channel.
     * @returns Native Goal identity, cumulative tokens and unconfirmed request identities. */
    async command(context, value) {
        this.assert(context);
        const request = parseSync(value);
        await this.mount(context);
        this.assert(context);
        const key = this.key(context, request.missionId);
        if (request.action === 'inspect') {
            const row = this.rows.get(key);
            if (!row)
                throw Error('HARNESS_RESEARCH_GOAL_NOT_FOUND');
            return this.view(row);
        }
        const previous = this.commands.get(key);
        const pending = (async () => { if (previous)
            await previous.catch(() => { }); return this.sync(context, request); })();
        this.commands.set(key, pending);
        try {
            return await pending;
        }
        finally {
            if (this.commands.get(key) === pending)
                this.commands.delete(key);
        }
    }
    async sync(context, request) {
        this.assert(context);
        const key = this.key(context, request.missionId);
        let row = this.rows.get(key);
        const parent = this.ctx.agents.get(SessionId(context.sessionId));
        if (!parent || !this.ctx.agents.roots().includes(parent) || parent.session.header.cwd !== this.options.directory(context))
            throw Error('HARNESS_RESEARCH_GOAL_SESSION_DENIED');
        if (!row) {
            if (!request.explicit || request.state !== 'active')
                throw Error('HARNESS_RESEARCH_GOAL_EXPLICIT_SETTING_REQUIRED');
            this.requireGrant(context, request);
            if (fs.existsSync(path.join(this.directory(context), request.missionId + '.json')))
                throw Error('HARNESS_RESEARCH_GOAL_NOT_FOUND');
            const resolved = frozen(await this.options.freeze(context, request.missionId, request.objective));
            this.assert(context);
            this.requireGrant(context, request);
            const childId = goalSessionId(context, request.missionId);
            row = { schemaVersion: 1, context: structuredClone(context), missionId: request.missionId, goalSessionId: childId, frozen: resolved, objective: request.objective, tokenBudget: request.tokenBudget, tokensUsed: 0, state: 'active', admission: 'admitting', members: [{ sessionId: childId, parentSessionId: context.sessionId, fromSeq: -1, throughSeq: -1, tokensUsed: 0 }], unknownRequests: [], file: path.join(this.directory(context), request.missionId + '.json') };
            this.rows.set(key, row);
            this.save(row);
            try {
                const agent = await this.child(row, parent, true);
                this.requireGrant(context, request);
                const goal = this.ctx.goals.create(agent, { objective: request.objective, maxGoalRounds: Number.MAX_SAFE_INTEGER });
                row.goalId = goal.id;
                row.admission = 'ready';
                this.save(row);
            }
            catch (error) {
                const handle = this.handles.get(childId);
                if (handle) {
                    await handle.dispose();
                    this.handles.delete(childId);
                }
                if (this.options.current(context))
                    this.unknown(row, `${childId}:goal-admission`);
                throw error;
            }
            return this.view(row);
        }
        if (terminal(row.state) && request.state !== row.state)
            throw Error('HARNESS_RESEARCH_GOAL_TERMINAL');
        if (request.state === 'active' && (row.fault || row.unknownRequests.length || row.admission !== 'ready'))
            throw Error('HARNESS_RESEARCH_GOAL_USAGE_UNCONFIRMED');
        if (request.tokenBudget > row.tokenBudget || request.objective !== row.objective || request.explicit && request.state === 'active')
            this.requireGrant(context, request);
        row.context = structuredClone(context);
        row.objective = request.objective;
        row.tokenBudget = request.tokenBudget;
        row.state = terminal(request.state) ? request.state : row.unknownRequests.length ? 'unknown' : row.tokensUsed >= row.tokenBudget ? 'budget-exhausted' : request.state;
        this.save(row);
        // Read-only refresh and closure never materialize a cold paid conversation.
        const agent = request.explicit && row.state === 'active' ? await this.child(row, parent, false) : this.ctx.agents.get(SessionId(row.goalSessionId));
        if (!agent)
            return this.view(row);
        let goal = this.ctx.goals.get(agent);
        if (!goal || goal.id !== row.goalId)
            throw Error('HARNESS_RESEARCH_GOAL_IDENTITY_DENIED');
        if (request.explicit && goal.objective !== row.objective)
            goal = this.ctx.goals.edit(agent, { id: goal.id, revision: goal.revision }, { objective: row.objective });
        if (terminal(row.state)) {
            if (goal.phase !== 'complete')
                this.ctx.goals.complete(agent, { id: goal.id, revision: goal.revision });
            if (row.state !== 'complete')
                agent.cancel({ kind: 'user' });
        }
        else if (row.state === 'paused') {
            if (goal.phase === 'active')
                this.ctx.goals.pause(agent, { id: goal.id, revision: goal.revision });
        }
        else if (row.state === 'budget-exhausted')
            this.block(row);
        else if (request.explicit) {
            if (goal.phase !== 'active' || goal.activation !== 'armed')
                this.ctx.goals.resume(agent, { id: goal.id, revision: goal.revision });
        }
        return this.view(row);
    }
    /** Detach account or project rows while retaining observers for the next admitted binding.
     * @param projectId - Optional project; omission detaches every active account row.
     * @returns Resolves after local activation and outstanding authorization are withdrawn. */
    async suspend(projectId) {
        for (const [key, row] of this.rows)
            if (projectId === undefined || row.context.projectId === projectId) {
                const agent = this.ctx.agents.get(SessionId(row.goalSessionId));
                if (agent && this.ctx.goals.get(agent)?.id === row.goalId)
                    this.ctx.goals.disarm(agent);
                if (row.state === 'active') {
                    row.state = 'paused';
                    if (this.options.current(row.context))
                        this.save(row);
                }
                const handle = this.handles.get(row.goalSessionId);
                if (agent)
                    await this.ctx.get('subagents')?.drainDescendants([agent]);
                if (handle) {
                    try {
                        await handle.dispose();
                    }
                    finally {
                        this.handles.delete(row.goalSessionId);
                    }
                }
                this.rows.delete(key);
            }
        for (const [key, grant] of this.grants)
            if (projectId === undefined || grant.projectId === projectId)
                this.grants.delete(key);
    }
    /** Permanently detach the Goal accounting observers owned by this Host lifecycle.
     * @returns Resolves after every row is disarmed and observers are removed. */
    async close() {
        await this.suspend();
        for (const dispose of this.dispose.splice(0))
            dispose();
    }
}
//# sourceMappingURL=research-goal.js.map