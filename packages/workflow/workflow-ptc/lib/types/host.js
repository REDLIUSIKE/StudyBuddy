import { SessionId } from '@deepseek-ai/dsh-session';
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import { assertNever, snapshotJsonValue } from '@deepseek-ai/dsh-util-values';
import { WORKFLOW_GUEST_SOURCE } from "./guest-source.js";
import { renderThrown } from "./realm.js";
const GUEST_URL = `data:text/javascript,${encodeURIComponent(WORKFLOW_GUEST_SOURCE)}`;
const PROGRAM = `const { runWorkflowGuest } = await import(${JSON.stringify(GUEST_URL)}); return await runWorkflowGuest(workflowHost);`;
function object(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('workflow binding requires an object');
    return value;
}
function text(value, name) {
    if (typeof value !== 'string')
        throw new Error(`workflow ${name} must be a string`);
    return value;
}
function json(value) {
    const result = snapshotJsonValue(value);
    if (result === undefined)
        throw new Error('workflow binding value must be lossless JSON');
    return result;
}
function childRequest(value) {
    const request = object(value);
    const prompt = text(request.prompt, 'prompt');
    const provider = request.provider === undefined ? undefined : text(request.provider, 'provider');
    const model = request.model === undefined ? undefined : text(request.model, 'model');
    let schema;
    if (request.schema !== undefined) {
        const candidate = object(request.schema);
        assertObjectJsonSchema(candidate);
        schema = candidate;
    }
    return {
        prompt,
        ...provider === undefined ? {} : { provider },
        ...model === undefined ? {} : { model },
        ...schema === undefined ? {} : { schema },
    };
}
function agentInfo(value) {
    const info = object(value);
    if (!Number.isSafeInteger(info.seq) || info.seq < 1)
        throw new Error('workflow agent sequence must be a positive integer');
    return {
        seq: info.seq,
        label: text(info.label, 'agent label'),
        childId: SessionId(text(info.childId, 'child id')),
        ...info.phase === undefined ? {} : { phase: text(info.phase, 'agent phase') },
    };
}
function progress(value) {
    const event = object(value);
    switch (event.type) {
        case 'phase': return { type: 'phase', title: text(event.title, 'phase') };
        case 'log': return { type: 'log', message: text(event.message, 'log') };
        case 'agent-start': return { type: 'agent-start', info: agentInfo(event.info) };
        case 'agent-end': {
            const info = object(event.info);
            if (info.outcome !== 'completed' && info.outcome !== 'failed' && info.outcome !== 'cancelled')
                throw new Error('invalid workflow agent outcome');
            return { type: 'agent-end', info: { ...agentInfo(info), outcome: info.outcome } };
        }
        default: throw new Error('invalid workflow progress event');
    }
}
function progressBatch(value) {
    if (!Array.isArray(value))
        throw new Error('workflow progress requires an array of events');
    return value.map(progress);
}
function workflowResult(value) {
    const result = object(value);
    if (result.stopReason !== 'completed' && result.stopReason !== 'error' && result.stopReason !== 'cancelled')
        throw new Error('invalid workflow stop reason');
    if (!Number.isSafeInteger(result.agentsStarted) || result.agentsStarted < 0)
        throw new Error('invalid workflow agent count');
    if (!Object.hasOwn(result, 'value'))
        throw new Error('workflow result is missing its value');
    return {
        value: result.value,
        stopReason: result.stopReason,
        agentsStarted: result.agentsStarted,
        ...result.error === undefined ? {} : { error: text(result.error, 'error') },
    };
}
/**
 * Holder-owned workflow. Cancellation stops the program immediately; settlement waits for
 * its managed process and every admitted child startup/disposal. Engine unload does not
 * invalidate the captured runtime or subagent handles.
 */
export class PtcWorkflowRun {
    ctx;
    subagents;
    runtime;
    id;
    meta;
    parent;
    init;
    provider;
    policy;
    observer;
    signal;
    result;
    controller = new AbortController();
    children = new Map();
    pending = new Set();
    liveAgents = new Map();
    started = 0;
    terminal = false;
    cancelReason;
    disposed;
    externalAbort;
    cwd;
    constructor(ctx, subagents, runtime, id, meta, parent, init, provider, policy, observer, signal) {
        this.ctx = ctx;
        this.subagents = subagents;
        this.runtime = runtime;
        this.id = id;
        this.meta = meta;
        this.parent = parent;
        this.init = init;
        this.provider = provider;
        this.policy = policy;
        this.observer = observer;
        this.signal = signal;
        this.externalAbort = () => { this.cancel('workflow signal aborted'); };
        if (signal?.aborted)
            this.externalAbort();
        else
            signal?.addEventListener('abort', this.externalAbort, { once: true });
        this.cwd = ctx.workingDirectory.ensure(parent, this.controller.signal);
        // Consumers attach durable run recording after start() returns.
        this.result = Promise.resolve().then(() => this.drive());
    }
    /**
     * Stop the script and abort pending and published children.
     * @param reason - Human-readable cancellation cause; the first request wins.
     */
    cancel(reason = 'workflow cancelled') {
        if (this.terminal || this.cancelReason !== undefined)
            return;
        this.cancelReason = reason;
        this.controller.abort(reason);
        for (const record of this.children.values())
            void this.disposeChild(record);
    }
    /**
     * Cancel unfinished work and await the program and child cleanup.
     * @returns One shared completion promise for repeated disposal calls.
     */
    dispose() {
        this.cancel('workflow disposed');
        this.disposed ??= this.result.then(() => { });
        return this.disposed;
    }
    requireActive() {
        this.controller.signal.throwIfAborted();
    }
    track(task) {
        this.pending.add(task);
        void task.then(() => { this.pending.delete(task); }, () => { this.pending.delete(task); });
        return task;
    }
    bindings() {
        return {
            begin: () => { this.requireActive(); return Promise.resolve(json(this.init)); },
            startChild: value => this.track(this.startChild(childRequest(value))),
            childResult: value => this.track(this.childResult(this.child(value))),
            disposeChild: async (value) => { await this.disposeChild(this.child(value)); return null; },
            progress: (value) => {
                for (const event of progressBatch(value))
                    this.onProgress(event);
                return Promise.resolve(null);
            },
        };
    }
    child(value) {
        this.requireActive();
        const callId = object(value).callId;
        if (!Number.isSafeInteger(callId))
            throw new Error('workflow child call id must be an integer');
        const record = this.children.get(callId);
        if (record === undefined)
            throw new Error('workflow child call is not active');
        return record;
    }
    async startChild(request) {
        this.requireActive();
        const callId = ++this.started;
        const run = await this.subagents.startActivation({
            provider: this.provider,
            label: `${this.meta.name} child ${callId}`,
            delivery: 'caller',
            signal: this.controller.signal,
            request: {
                cwd: await this.cwd,
                prompt: [{ type: 'text', text: request.prompt }],
                parent: this.parent,
                ...request.schema === undefined ? {} : { outputSchema: request.schema },
                ...request.provider === undefined && request.model === undefined ? {} : {
                    agentOptions: {
                        ...request.provider === undefined ? {} : { provider: request.provider },
                        ...request.model === undefined ? {} : { model: request.model },
                    },
                },
            },
        });
        const record = { callId, run };
        this.children.set(callId, record);
        // A provider can publish after the signal fired while startup was pending.
        if (this.controller.signal.aborted) {
            await this.disposeChild(record);
            throw new Error('workflow child started after cancellation');
        }
        return { callId, childId: run.childId };
    }
    async childResult(record) {
        const signal = this.controller.signal;
        signal.throwIfAborted();
        const aborted = Promise.withResolvers();
        const onAbort = () => { aborted.reject(signal.reason); };
        signal.addEventListener('abort', onAbort, { once: true });
        try {
            const result = await Promise.race([record.run.result, aborted.promise]);
            return json({
                output: result.output,
                stopReason: result.stopReason,
                ...result.structured === undefined ? {} : { structured: result.structured },
            });
        }
        finally {
            signal.removeEventListener('abort', onAbort);
        }
    }
    disposeChild(record) {
        record.disposal ??= Promise.resolve().then(() => record.run.dispose()).catch((error) => {
            this.ctx.logger.warn(`workflow-ptc: child dispose failed: ${renderThrown(error)}`);
        }).finally(() => {
            this.children.delete(record.callId);
        });
        return record.disposal;
    }
    onProgress(event) {
        this.requireActive();
        switch (event.type) {
            case 'phase':
                this.observer.phase(event.title);
                break;
            case 'log':
                this.observer.log(event.message);
                break;
            case 'agent-start':
                this.liveAgents.set(event.info.seq, event.info);
                this.observer.agentStart(event.info);
                break;
            case 'agent-end':
                this.endAgent(event.info);
                break;
            /* v8 ignore next -- progress() validates the closed message union before dispatch. */
            default: assertNever(event, 'workflow progress');
        }
    }
    endAgent(info) {
        if (!this.liveAgents.delete(info.seq))
            return;
        this.observer.agentEnd(info);
    }
    cancelled() {
        return { value: null, stopReason: 'cancelled', error: `workflow run cancelled: ${this.cancelReason}`, agentsStarted: this.started };
    }
    async drive() {
        let result;
        try {
            const cwd = await this.cwd;
            this.requireActive();
            const outcome = await this.runtime.run(this.runtime.resolve({
                program: PROGRAM,
                bindings: [{ global: 'workflowHost', functions: this.bindings() }],
                cwd,
                sandboxPolicy: this.policy,
                timeoutMs: null,
                signal: this.controller.signal,
            }));
            this.terminal = true;
            if (this.cancelReason !== undefined)
                result = this.cancelled();
            else if (outcome.error !== undefined)
                result = { value: null, stopReason: 'error', error: `workflow execution failed (${outcome.error.kind}): ${outcome.error.message}`, agentsStarted: this.started };
            else
                result = workflowResult(outcome.value);
        }
        catch (error) {
            this.terminal = true;
            result = this.cancelReason === undefined
                ? { value: null, stopReason: 'error', error: renderThrown(error), agentsStarted: this.started }
                : this.cancelled();
        }
        finally {
            this.terminal = true;
            this.signal?.removeEventListener('abort', this.externalAbort);
            this.controller.abort('workflow settled');
            // Disposing published children releases binding waits; pending starts may publish more.
            for (const record of this.children.values())
                void this.disposeChild(record);
            while (this.pending.size > 0)
                await Promise.allSettled([...this.pending]);
            await Promise.all([...this.children.values()].map(record => this.disposeChild(record)));
            this.children.clear();
            for (const info of this.liveAgents.values())
                this.endAgent({ ...info, outcome: 'cancelled' });
        }
        return result;
    }
}
//# sourceMappingURL=host.js.map