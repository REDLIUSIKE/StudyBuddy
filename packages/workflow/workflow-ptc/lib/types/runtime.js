/**
 * Workflow VM hooks, child callbacks, ordinary concurrency limits and result serialization.
 * PTC owns process confinement and cancellation. Fatal hook and provider failures propagate
 * through combinators; ordinary child failures and stage errors become per-item nulls.
 * @module @deepseek-ai/dsh-workflow-ptc/runtime
 */
import * as vm from 'node:vm';
import { brandString } from '@deepseek-ai/dsh-brand';
import { assertObjectJsonSchema, JsonSchemaError } from '@deepseek-ai/dsh-tools';
import { isFatalWorkflowError, WorkflowError } from '@deepseek-ai/dsh-workflow';
import { materializeFromRealm, MaterializeError, renderThrown } from "./realm.js";
/** The `agent()` options the script may pass; everything else rejects loud. */
const SUPPORTED_AGENT_OPTIONS = new Set(['label', 'phase', 'schema', 'provider', 'model']);
/** Deferred Claude Code options we name explicitly in the rejection message. */
const DEFERRED_AGENT_OPTIONS = new Set(['effort', 'isolation', 'agentType']);
/** Flatten a child's final output blocks to text (the non-schema `agent()` result). */
function outputText(blocks) {
    return blocks
        .filter((block) => block.type === 'text')
        .map(block => block.text)
        .join('');
}
/** A short display label derived from the prompt when the script passes none. */
function defaultLabel(prompt) {
    const newline = prompt.indexOf('\n');
    const line = newline === -1 ? prompt : prompt.slice(0, newline);
    return line.length <= 48 ? line : `${line.slice(0, 47)}…`;
}
/**
 * One script execution inside the confined Node process. The host owns
 * cancellation and cleanup of any dropped child work.
 */
export class WorkflowExecution {
    limits;
    observer;
    children;
    /** 1-based count of `agent()` calls started (the `agentsStarted` result field). */
    started = 0;
    activeSlots = 0;
    slotWaiters = [];
    currentPhase;
    context;
    compiled;
    constructor(meta, body, args, limits, observer, children) {
        this.limits = limits;
        this.observer = observer;
        this.children = children;
        // The host parses this same wrapper before publishing a run.
        try {
            this.compiled = new vm.Script(`(async () => {\n${body}\n})()`, {
                filename: `workflow:${meta.name}`,
                lineOffset: -1,
            });
        }
        catch (error) {
            throw new WorkflowError(`workflow script does not parse: ${String(error)}`, 'SCRIPT_PARSE', { cause: error });
        }
        this.context = vm.createContext({}, { name: `workflow:${meta.name}` });
        const globals = {
            agent: (prompt, opts) => this.contain(this.agent(prompt, opts)),
            parallel: (thunks) => this.contain(this.parallel(thunks)),
            pipeline: (items, ...stages) => this.contain(this.pipeline(items, stages)),
            phase: (title) => { this.phase(title); },
            log: (message) => { this.log(message); },
            // PTC has already copied these inputs through its JSON channel.
            args,
        };
        for (const [key, value] of Object.entries(globals)) {
            // Data properties on the contextified global; frozen shape not required —
            // a script overwriting its own hooks only sabotages itself.
            ;
            this.context[key] = typeof value === 'function' ? Object.freeze(value) : value;
        }
    }
    /**
     * Run the script and materialize its JSON return value.
     * @returns A completed or error result; script failures never reject.
     */
    async drive() {
        try {
            const scriptPromise = this.compiled.runInContext(this.context, { timeout: this.limits.syncTimeoutMs });
            const raw = await this.contain(Promise.resolve(scriptPromise));
            const value = raw === undefined ? null : this.materializeResult(raw);
            return { value, stopReason: 'completed', agentsStarted: this.started };
        }
        catch (error) {
            return { value: null, stopReason: 'error', error: renderThrown(error), agentsStarted: this.started };
        }
    }
    /**
     * Attach a no-op rejection consumer WITHOUT changing what the caller
     * receives: if the script drops the promise, a host rejection cannot become
     * an unhandled rejection that kills the process; if
     * the script does await it, it still observes the rejection.
     */
    contain(promise) {
        promise.catch(() => { });
        return promise;
    }
    /** Materialize the script's return value; violations become RESULT_UNSERIALIZABLE. */
    materializeResult(raw) {
        try {
            return materializeFromRealm(raw, 'workflow result');
        }
        catch (error) {
            /* v8 ignore next -- defensive rethrow arm: materializeFromRealm only throws MaterializeError */
            if (!(error instanceof MaterializeError))
                throw error;
            throw new WorkflowError(`the workflow's return value is not plain JSON data — ${error.message}. Return only JSON-serializable objects/arrays/scalars.`, 'RESULT_UNSERIALIZABLE', { cause: error });
        }
    }
    /** Acquire one concurrency slot in FIFO order. */
    acquireSlot() {
        if (this.activeSlots < this.limits.maxConcurrentAgents) {
            this.activeSlots += 1;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.slotWaiters.push(() => {
                this.activeSlots += 1;
                resolve();
            });
        });
    }
    releaseSlot() {
        this.activeSlots -= 1;
        const next = this.slotWaiters.shift();
        if (next)
            next();
    }
    /** The `agent(prompt, opts)` hook. */
    async agent(rawPrompt, rawOpts) {
        if (typeof rawPrompt !== 'string' || rawPrompt.length === 0) {
            throw new WorkflowError('agent() requires a non-empty prompt string', 'INVALID_ARGUMENT');
        }
        const opts = this.readAgentOptions(rawOpts);
        if (this.started >= this.limits.maxTotalAgents) {
            throw new WorkflowError(`this run reached its total agent cap (${this.limits.maxTotalAgents}) — a runaway-loop backstop; raise the applicable maxTotalAgents limit if the scale is intentional`, 'AGENT_CAP');
        }
        this.started += 1;
        const seq = this.started;
        const label = opts.label ?? defaultLabel(rawPrompt);
        const phase = opts.phase ?? this.currentPhase;
        await this.acquireSlot();
        try {
            let run;
            try {
                run = await this.children.startAgent({
                    prompt: rawPrompt,
                    ...opts.schema !== undefined ? { schema: opts.schema } : {},
                    ...opts.provider !== undefined ? { provider: opts.provider } : {},
                    ...opts.model !== undefined ? { model: opts.model } : {},
                });
            }
            catch (error) {
                throw new WorkflowError(`agent() could not start a child: ${renderThrown(error)}`, 'AGENT_START', { cause: error });
            }
            const info = { seq, label, ...phase !== undefined ? { phase } : {}, childId: brandString(run.id) };
            this.observer.agentStart(info);
            try {
                let result;
                try {
                    result = await run.result;
                }
                catch (error) {
                    // A rejected child result is an INFRASTRUCTURE fault relayed by the
                    // host — distinct from a child that failed and resolved. Pair the
                    // lifecycle before propagating, and propagate FATAL: an ordinary
                    // throw would dissolve to a per-item null inside the combinators,
                    // and a broken provider must not read as a failed child.
                    this.observer.agentEnd({ ...info, outcome: 'failed' });
                    throw new WorkflowError(`child agent run failed: ${renderThrown(error)}`, 'AGENT_RESULT', { cause: error });
                }
                if (result.stopReason === 'completed') {
                    if (opts.schema !== undefined) {
                        // The provider honored outputSchema (capability-gated at start), so
                        // a completed run without a structured value is a child failure.
                        if (result.structured === undefined) {
                            this.observer.agentEnd({ ...info, outcome: 'failed' });
                            return null;
                        }
                        this.observer.agentEnd({ ...info, outcome: 'completed' });
                        return result.structured;
                    }
                    this.observer.agentEnd({ ...info, outcome: 'completed' });
                    return outputText(result.output);
                }
                this.observer.agentEnd({ ...info, outcome: 'failed' });
                return null;
            }
            finally {
                await run.dispose();
            }
        }
        finally {
            this.releaseSlot();
        }
    }
    /** Materialize + validate the `agent()` options bag from the realm. */
    readAgentOptions(rawOpts) {
        if (rawOpts === undefined)
            return {};
        let opts;
        try {
            opts = materializeFromRealm(rawOpts, 'agent() options');
        }
        catch (error) {
            /* v8 ignore next -- defensive rethrow arm: materializeFromRealm only throws MaterializeError */
            if (!(error instanceof MaterializeError))
                throw error;
            throw new WorkflowError(`agent() options must be plain JSON data — ${error.message}`, 'INVALID_ARGUMENT', { cause: error });
        }
        if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
            throw new WorkflowError('agent() options must be an object', 'INVALID_ARGUMENT');
        }
        const record = opts;
        for (const key of Object.keys(record)) {
            if (SUPPORTED_AGENT_OPTIONS.has(key))
                continue;
            if (DEFERRED_AGENT_OPTIONS.has(key)) {
                throw new WorkflowError(`agent() option "${key}" is deferred and not supported by this engine (supported: label, phase, schema, provider, model)`, 'UNSUPPORTED_OPTION');
            }
            throw new WorkflowError(`agent() option "${key}" is not recognized (supported: label, phase, schema, provider, model)`, 'UNSUPPORTED_OPTION');
        }
        for (const key of ['label', 'phase', 'provider', 'model']) {
            if (record[key] !== undefined && typeof record[key] !== 'string') {
                throw new WorkflowError(`agent() option "${key}" must be a string`, 'INVALID_ARGUMENT');
            }
        }
        let schema;
        if (record.schema !== undefined) {
            try {
                assertObjectJsonSchema(record.schema);
                schema = record.schema;
            }
            catch (error) {
                /* v8 ignore next -- defensive rethrow arm: assertObjectJsonSchema only throws JsonSchemaError */
                if (!(error instanceof JsonSchemaError))
                    throw error;
                throw new WorkflowError(`agent() schema is outside the supported subset — ${error.message}`, 'UNSUPPORTED_SCHEMA', { cause: error });
            }
        }
        return {
            ...record.label !== undefined ? { label: record.label } : {},
            ...record.phase !== undefined ? { phase: record.phase } : {},
            ...record.provider !== undefined ? { provider: record.provider } : {},
            ...record.model !== undefined ? { model: record.model } : {},
            ...schema !== undefined ? { schema } : {},
        };
    }
    /** The `parallel(thunks)` hook: each thunk caught → `null`; fatal errors propagate. */
    async parallel(rawThunks) {
        if (!Array.isArray(rawThunks)) {
            throw new WorkflowError('parallel() requires an array of zero-argument functions', 'INVALID_ARGUMENT');
        }
        this.assertItemCap(rawThunks.length, 'parallel()');
        const thunks = rawThunks.map((thunk, index) => {
            if (typeof thunk !== 'function') {
                throw new WorkflowError(`parallel() item ${index} is not a function`, 'INVALID_ARGUMENT');
            }
            return thunk;
        });
        return Promise.all(thunks.map(async (thunk) => {
            try {
                return await thunk();
            }
            catch (error) {
                // Hook failures are WorkflowErrors built OUTSIDE the script's realm;
                // fatality is recognized by `instanceof` against this realm's class —
                // a script-built object can never pass it, so fatality cannot be
                // forged (nor accidentally dissolved).
                if (isFatalWorkflowError(error))
                    throw error;
                return null;
            }
        }));
    }
    /** The `pipeline(items, ...stages)` hook: per-item stage chains, NO cross-stage barrier. */
    async pipeline(rawItems, rawStages) {
        if (!Array.isArray(rawItems)) {
            throw new WorkflowError('pipeline() requires an items array', 'INVALID_ARGUMENT');
        }
        this.assertItemCap(rawItems.length, 'pipeline()');
        if (rawStages.length === 0) {
            throw new WorkflowError('pipeline() requires at least one stage function', 'INVALID_ARGUMENT');
        }
        const stages = rawStages.map((stage, index) => {
            if (typeof stage !== 'function') {
                throw new WorkflowError(`pipeline() stage ${index} is not a function`, 'INVALID_ARGUMENT');
            }
            return stage;
        });
        return Promise.all(rawItems.map(async (item, index) => {
            let value = item;
            try {
                for (const stage of stages) {
                    value = await stage(value, item, index);
                }
                return value;
            }
            catch (error) {
                // An ordinary stage throw drops the ITEM to null and skips its
                // remaining stages; a fatal WorkflowError (see parallel()) kills the
                // whole script.
                if (isFatalWorkflowError(error))
                    throw error;
                return null;
            }
        }));
    }
    assertItemCap(length, hook) {
        if (length > this.limits.maxItemsPerCall) {
            throw new WorkflowError(`${hook} received ${length} items — over the per-call cap (${this.limits.maxItemsPerCall}); split the work or raise maxItemsPerCall in the engine config`, 'ITEM_CAP');
        }
    }
    /** The `phase(title)` hook: sets the current label for subsequent `agent()` calls and notifies observers. */
    phase(title) {
        if (typeof title !== 'string' || title.length === 0) {
            throw new WorkflowError('phase() requires a non-empty title string', 'INVALID_ARGUMENT');
        }
        this.currentPhase = title;
        this.observer.phase(title);
    }
    /** The `log(message)` hook: narration to observers. */
    log(message) {
        if (typeof message !== 'string') {
            throw new WorkflowError('log() requires a message string', 'INVALID_ARGUMENT');
        }
        this.observer.log(message);
    }
}
//# sourceMappingURL=runtime.js.map