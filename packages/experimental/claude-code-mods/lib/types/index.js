/**
 * Experimental bridge for Claude Code mods. A mod is a DSH plugin built with
 * {@link defineMod} around the mod's `register(on, options)`; this service
 * keeps the loaded mods and raises their events from harness extension
 * points — `session.start` on `agent/created`, `prompt.submit` and
 * `turn.start` on `agent/pre-step`, `tool.call` around `tools/execute`,
 * `turn.complete` on `turn/end`, `session.end` on `agent/disposed`, and
 * `command.run` from the commands a mod registers. The `$` a hook receives is
 * served by {@link createHostOps} over the composed harness services.
 * @module @deepseek-ai/dsh-experimental-claude-code-mods
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import z from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { SessionId } from '@deepseek-ai/dsh-session';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { RewriteRefusedError } from "./chain.js";
import { ModsEngine } from "./engine.js";
import { createHostOps, toolCallResultOf } from "./host-ops.js";
import { SurfaceTable } from "./surfaces.js";
import { createToolNameAliases } from "./tool-names.js";
import { messageOf, record, stringify } from "./values.js";
export { defineMod } from "./define-mod.js";
export { DEFAULT_TOOL_ALIASES } from "./tool-names.js";
export { KNOWN_EVENTS } from "./matcher.js";
export { MODS_API_VERSION } from "./host-ops.js";
/** Engine events this host raises; a hook on any other known event registers and is reported as unserved. */
export const SERVED_EVENTS = new Set([
    'session.start', 'session.end', 'prompt.submit', 'turn.start', 'turn.complete', 'tool.call', 'command.run', 'ui.render',
]);
/** Where the deferred argument-rewrite mechanism is specified. */
const REWRITE_NOTE = '.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.md';
function assertPositive(field, value) {
    if (!Number.isFinite(value) || value <= 0)
        throw new Error(`claude-code-mods: ${field} must be a positive number of milliseconds`);
}
function textOf(blocks) {
    return blocks.filter((block) => block.type === 'text').map(block => block.text).join('');
}
/** The human's own messages among a claim: the prompt a `prompt.submit` hook sees and may rewrite. */
function promptMessages(claimed) {
    return claimed.filter(message => message.source.kind === 'user');
}
/**
 * Replace the prompt text across the human's messages with one rewritten
 * text: the first text block carries it, other text blocks go, every
 * non-text block stays in place. A prompt without any text block, such as an
 * image alone, gains the text after its blocks.
 */
function rewritePromptText(prompt, text) {
    // Written inside the map callback, so the flag lives on an object the later read sees current.
    const placement = { placed: false };
    const rewritten = prompt.map((message) => {
        if (!message.content.some(block => block.type === 'text'))
            return message;
        const content = [];
        for (const block of message.content) {
            if (block.type !== 'text') {
                content.push(block);
            }
            else if (!placement.placed) {
                placement.placed = true;
                content.push({ type: 'text', text });
            }
        }
        return { ...message, content };
    });
    const first = rewritten[0];
    if (placement.placed || text.length === 0 || first === undefined)
        return rewritten;
    return [{ ...first, content: [...first.content, { type: 'text', text }] }, ...rewritten.slice(1)];
}
/** Append the context a hook attached as blocks after the prompt as typed, on the last of the human's messages. */
function appendContext(prompt, context) {
    const last = prompt.at(-1);
    /* v8 ignore next -- the caller only appends context to a prompt it raised, which has at least one human message */
    if (last === undefined)
        return [...prompt];
    const blocks = context.map(line => ({ type: 'text', text: line }));
    return [...prompt.slice(0, -1), { ...last, content: [...last.content, ...blocks] }];
}
/** Keep only the fields of a `prompt.submit` result a mod may set, each with its declared type. */
function acceptPromptSubmit(result, original) {
    if (typeof result.drop === 'string')
        return { drop: result.drop };
    const context = Array.isArray(result.context) ? result.context.filter((line) => typeof line === 'string') : [];
    return { text: typeof result.text === 'string' ? result.text : original, ...context.length === 0 ? {} : { context } };
}
/** Fold one committed assistant message into the turn's answer and usage. */
function foldAssistantMessage(turnRecord, data) {
    turnRecord.answer = textOf(data.message.content);
    if (data.usage === undefined)
        return;
    const { model } = data.message.source;
    const usage = turnRecord.usage ?? { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model };
    usage.input_tokens += data.usage.inputTokens;
    usage.output_tokens += data.usage.outputTokens;
    usage.cache_read_input_tokens += data.usage.cacheReadTokens ?? 0;
    usage.cache_creation_input_tokens += data.usage.cacheWriteTokens ?? 0;
    usage.model = model;
    turnRecord.usage = usage;
}
/** Detached mod runs the bridge tracks so disposal can await them; a rejection is reported, never unhandled. */
class DetachedRuns {
    report;
    pending = new Set();
    controller = new AbortController();
    constructor(report) {
        this.report = report;
    }
    track(label, run) {
        /* v8 ignore next -- the engine behaviors beneath these runs are total; the report guards a future rejecting one */
        const settled = run.then(() => undefined, (error) => { this.report(`${label} failed: ${messageOf(error)}`); });
        this.pending.add(settled);
        void settled.finally(() => { this.pending.delete(settled); });
    }
    /** Abort every run's signal; `drain` then waits for them to settle. */
    cancel() {
        this.controller.abort(new Error('claude-code-mods disposed'));
    }
    async drain() {
        this.cancel();
        await Promise.allSettled([...this.pending]);
    }
}
/** The lossless-JSON copy of a mod's answer, or undefined when it has none. */
function jsonValueOf(value) {
    const text = stringify(value);
    return text === undefined ? undefined : JSON.parse(text);
}
/** An error-shaped tool result carrying a mod's text in place of the tool's own. */
function modAnswered(text, code, rendered = text) {
    return {
        isError: true,
        error: { message: text, info: { name: code === 'MOD_DENIED' ? 'ModDenied' : 'ModAnswered', code } },
        content: [{ type: 'text', text: rendered }],
    };
}
/**
 * The bridge service: loaded mods, their hooks, and the harness listeners
 * that raise their events. Mods join through {@link ClaudeCodeMods.add},
 * which {@link defineMod} calls when a mod plugin mounts. The Remote methods
 * let a Client draw each session's band above the prompt and press its buttons.
 */
let ClaudeCodeMods = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _watchBand_decorators;
    let _pressBand_decorators;
    return class ClaudeCodeMods extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _watchBand_decorators = [Remote({ mode: 'stream' })];
            _pressBand_decorators = [Remote];
            __esDecorate(this, null, _watchBand_decorators, { kind: "method", name: "watchBand", static: false, private: false, access: { has: obj => "watchBand" in obj, get: obj => obj.watchBand }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _pressBand_decorators, { kind: "method", name: "pressBand", static: false, private: false, access: { has: obj => "pressBand" in obj, get: obj => obj.pressBand }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static Config = z.object({
            hookTimeoutMs: z.number().default(10_000),
            catchTimeoutMs: z.number().default(1_000),
            processTimeoutMs: z.number().default(30_000),
            toolAliases: z.dict(z.string()),
            bandColumns: z.number().default(120),
            bandRows: z.number().default(10),
        });
        // Session initialization requires its directory owner; other services are read on demand.
        static inject = ['workingDirectory'];
        engine = __runInitializers(this, _instanceExtraInitializers);
        registrations = new Map();
        surfaces;
        constructor(ctx, config) {
            super(ctx, 'claudeCodeMods', { namespace: 'claudeCodeMods' });
            // The schema supplies every default; a direct construction passes the fields it needs.
            const { hookTimeoutMs = 10_000, catchTimeoutMs = 1_000, processTimeoutMs = 30_000, bandColumns = 120, bandRows = 10 } = config;
            assertPositive('hookTimeoutMs', hookTimeoutMs);
            assertPositive('catchTimeoutMs', catchTimeoutMs);
            assertPositive('processTimeoutMs', processTimeoutMs);
            assertPositive('bandColumns', bandColumns);
            assertPositive('bandRows', bandRows);
            const aliases = createToolNameAliases(config.toolAliases);
            const callOrigins = new Map();
            const modCommands = new Set();
            const modTools = new Set();
            const report = (line) => { ctx.logger.warn(`claude-code-mods: ${line}`); };
            const agentOf = (sessionId) => ctx.get('agents')?.get(SessionId(sessionId));
            const detached = new DetachedRuns(report);
            const surfaces = new SurfaceTable({
                columns: bandColumns,
                rows: bandRows,
                render: (sessionId, input) => {
                    const agent = agentOf(sessionId);
                    /* v8 ignore next -- agent/disposed forgets the band before the registry drops the agent; a redraw racing it draws nothing */
                    if (agent === undefined)
                        return Promise.resolve(null);
                    return engine.raise('ui.render', input, () => null, {
                        binding: { agent }, signal: detached.controller.signal,
                    });
                },
                runAction: async (_sessionId, callback) => {
                    try {
                        await callback();
                    }
                    catch (error) {
                        report(`a button's onPress failed: ${messageOf(error)}`);
                    }
                },
                report,
            });
            this.surfaces = surfaces;
            // Deferred by one macrotask: a mod sets its own state right after the `$` call that triggers the redraw resolves.
            const redraw = (sessionId) => {
                setTimeout(() => {
                    if (agentOf(sessionId) !== undefined)
                        void surfaces.refresh(sessionId);
                }, 0).unref();
            };
            const modSubmissions = new Map();
            const ops = createHostOps({
                ctx, aliases, processTimeoutMs, registrations: this.registrations, callOrigins, modCommands, modTools, redraw,
                submitted: (messageId, mod) => { modSubmissions.set(messageId, mod); },
            });
            const engine = new ModsEngine({
                ops: op => ops[op],
                stateKey: binding => binding.agent?.session.id ?? '',
                budgetMs: hookTimeoutMs,
                catchBudgetMs: catchTimeoutMs,
                report,
                onStateRead: (key, slot) => { surfaces.stateRead(key, slot); },
                onStateWritten: (key, slot) => { surfaces.stateWritten(key, slot); },
            });
            this.engine = engine;
            const registrations = this.registrations;
            ctx.effect(() => async () => {
                // Cancel first: a timer callback waiting inside a `$` call ends on this signal, and engine.dispose awaits it.
                detached.cancel();
                surfaces.dispose();
                for (const owned of registrations.values())
                    for (const dispose of owned)
                        dispose();
                registrations.clear();
                await engine.dispose();
                await detached.drain();
            }, 'claude-code-mods: unload mods');
            // Read at each use: the registry may mount after this plugin in a composition.
            const isRoot = (agent) => {
                const agents = ctx.get('agents');
                return agents === undefined || agents.roots().includes(agent);
            };
            /** Root agents that received `session.start`; the registry no longer lists an agent once it is disposed. */
            const startedRoots = new Set();
            const agentIdOf = (agent) => agent !== undefined && !isRoot(agent) ? { agentId: agent.id } : {};
            /** Per-session fold of the open turn, keyed by session id. */
            const turns = new Map();
            /** Turns whose first pre-step already raised `turn.start`, by session id. */
            const startedTurns = new Map();
            /** Rewritten tool results the post-execute listener installs as content. */
            const replacements = new Map();
            ctx.on('agent/created', async ({ agent, signal }) => {
                if (!isRoot(agent))
                    return;
                startedRoots.add(agent.session.id);
                // Cancelling creation also cancels directory validation and a waiting hook.
                /* v8 ignore next -- the loop always supplies an initialization signal; the payload type keeps it optional */
                const abandon = signal === undefined ? detached.controller.signal : AbortSignal.any([signal, detached.controller.signal]);
                const input = {
                    cwd: await ctx.workingDirectory.ensure(agent, abandon),
                    surface: null,
                    isInteractive: ctx.get('userQuestions') !== undefined,
                };
                await engine.raise('session.start', input, e => ({ cwd: e.cwd }), { binding: { agent }, signal: abandon });
                redraw(agent.session.id);
            });
            ctx.on('agent/disposed', ({ agent }) => {
                const sessionId = agent.session.id;
                turns.delete(sessionId);
                startedTurns.delete(sessionId);
                // The agent's scoped registrations unwound with its context; only the bookkeeping remains.
                registrations.delete(sessionId);
                surfaces.forget(sessionId);
                const forget = () => engine.forgetSession(sessionId);
                if (!startedRoots.delete(sessionId)) {
                    detached.track('session cleanup', forget());
                    return;
                }
                const input = { reason: 'other', sessionId };
                // `$.state` stays readable and the session's timers keep running until the mods' `session.end` hooks have settled.
                detached.track('session.end', engine.raise('session.end', input, e => ({ sessionId: e.sessionId }), { binding: { agent }, signal: detached.controller.signal }).then(forget, forget));
            });
            ctx.on('agent/pre-step', async ({ agent, messages, turn, signal }, next) => {
                const binding = { agent };
                const started = startedTurns.get(agent.session.id) ?? new Set();
                startedTurns.set(agent.session.id, started);
                const first = !started.has(turn);
                started.add(turn);
                const prompt = promptMessages(messages);
                const text = textOf(prompt.flatMap(message => message.content));
                let submitted = { text };
                // A batch of injected context alone is not a prompt: Claude Code raises prompt.submit for typed prompts.
                if (prompt.length > 0) {
                    const submitter = prompt.map(message => modSubmissions.get(message.id)).find(name => name !== undefined);
                    for (const message of prompt)
                        modSubmissions.delete(message.id);
                    const input = {
                        text,
                        wait: false,
                        origin: submitter === undefined ? { kind: 'composer' } : { kind: 'plugin', name: submitter },
                    };
                    submitted = acceptPromptSubmit(await engine.raise('prompt.submit', input, e => ({ text: e.text, ...e.context === undefined ? {} : { context: e.context } }), { binding, signal }), text);
                    if (submitted.drop !== undefined) {
                        ctx.logger.info(`claude-code-mods: prompt dropped: ${submitted.drop}`);
                        return { kind: 'reject' };
                    }
                }
                if (first) {
                    const input = { text: submitted.text, turnId: String(turn), ...agentIdOf(agent) };
                    await engine.raise('turn.start', input, e => ({ turnId: e.turnId }), { binding, signal });
                }
                const downstream = await next();
                if (downstream.kind !== 'enter' || messages.length === 0)
                    return downstream;
                const context = submitted.context ?? [];
                if (submitted.text === text && context.length === 0)
                    return downstream;
                // The rewritten text and the attached context replace the human's messages in place; every other message stays.
                let edited = submitted.text === text ? [...prompt] : rewritePromptText(prompt, submitted.text);
                if (context.length > 0)
                    edited = appendContext(edited, context);
                const rewritten = new Map();
                edited.forEach((message, index) => { rewritten.set(prompt[index], message); });
                return { ...downstream, messages: downstream.messages.map(message => rewritten.get(message) ?? message) };
            });
            ctx.on('tools/execute', async (exec, next) => {
                // A call a mod raised through `$.tool.call` reaches only the mods loaded before it, never itself.
                const raisedBy = callOrigins.get(exec.callId);
                const hooks = engine.registry.select('tool.call', raisedBy);
                if (hooks.length === 0)
                    return next();
                const agent = exec.agent;
                const callArguments = record(exec.arguments);
                const modName = aliases.toMod(exec.name);
                const input = { ...callArguments, tool: modName, tool_use_id: exec.callId, ...agentIdOf(agent) };
                const logged = JSON.stringify(callArguments);
                let beneath;
                const answer = await engine.raiseWith('tool.call', hooks, raisedBy, input, async () => {
                    beneath = await next();
                    return toolCallResultOf(beneath);
                }, {
                    binding: { agent },
                    signal: exec.signal,
                    // The call is logged before policy runs, so the arguments a hook passes down must be the logged ones.
                    validateNext: (e) => {
                        const { tool, tool_use_id: _id, agentId: _agentId, ...rest } = e;
                        if (tool !== modName) {
                            throw new RewriteRefusedError(`rerouted the call from ${modName} to ${tool}; the logged call runs the tool it named`);
                        }
                        if (JSON.stringify(rest) !== logged) {
                            throw new RewriteRefusedError(`rewrote the arguments of ${modName}; argument rewrites need the pre-tool input rewrite mechanism (${REWRITE_NOTE})`);
                        }
                    },
                });
                if (agent !== undefined)
                    redraw(agent.session.id);
                if (answer.deny !== undefined)
                    return modAnswered(answer.deny, 'MOD_DENIED', `Error: ${answer.deny}`);
                const text = typeof answer.result === 'string' ? answer.result : stringify(answer.result) ?? '';
                if (beneath !== undefined) {
                    const mapped = toolCallResultOf(beneath);
                    if (mapped.result === answer.result && mapped.isError === answer.isError)
                        return beneath;
                    // A success the hook marked as failed becomes a failure; a failure stays one, with the hook's text.
                    if (answer.isError === true && !beneath.isError)
                        return modAnswered(text, 'MOD_ANSWERED');
                    replacements.set(exec.token, text);
                    return beneath;
                }
                if (answer.isError === true)
                    return modAnswered(text, 'MOD_ANSWERED');
                if (modTools.has(exec.name))
                    return { isError: false, value: text, content: [{ type: 'text', text }] };
                // A built-in tool's success value must satisfy its own output schema: a
                // conforming answer is the tool's result, any other is error-shaped.
                const definition = ctx.get('tools')?.get(exec.name, agent === undefined ? undefined : scopeOf(agent.ctx));
                const value = jsonValueOf(answer.result);
                if (definition !== undefined && value !== undefined && validateJsonSchemaValue(definition.output.schema, value).length === 0) {
                    return { isError: false, value, content: definition.output.render(exec.arguments, value) };
                }
                return modAnswered(text, 'MOD_ANSWERED');
            });
            // A call that never reaches post-execute (an earlier listener answered, or a pipeline failure) still clears its entry.
            ctx.on('tools/result', (exec) => { replacements.delete(exec.token); });
            ctx.on('tools/post-execute', async (exec, _result, next) => {
                const replacement = replacements.get(exec.token);
                if (replacement === undefined)
                    return next();
                replacements.delete(exec.token);
                const downstream = await next();
                if (downstream.kind === 'block')
                    return downstream;
                return {
                    kind: 'accept',
                    content: [{ type: 'text', text: replacement }],
                    ...downstream.additionalContexts === undefined ? {} : { additionalContexts: downstream.additionalContexts },
                };
            });
            ctx.on('session/event', (session, event) => {
                if (event.type === 'turn/start') {
                    turns.set(session.id, { turn: event.data.turn, startedAt: Date.now(), answer: '', usage: undefined });
                    return;
                }
                if (event.type === 'assistant/message') {
                    const turnRecord = turns.get(session.id);
                    if (turnRecord !== undefined)
                        foldAssistantMessage(turnRecord, event.data);
                    return;
                }
                if (event.type !== 'turn/end')
                    return;
                const { turn, reason } = event.data;
                startedTurns.get(session.id)?.delete(turn);
                const agent = ctx.get('agents')?.get(session.id);
                if (agent === undefined)
                    return;
                const turnRecord = turns.get(session.id);
                const folded = turnRecord?.turn === turn ? turnRecord : undefined;
                const input = {
                    turnId: String(turn),
                    answer: folded?.answer ?? '',
                    durationMs: folded === undefined ? 0 : Date.now() - folded.startedAt,
                    isAborted: reason.kind === 'aborted',
                    reason: reason.kind === 'aborted' ? 'aborted' : reason.kind === 'error' ? 'error' : 'answer',
                    ...agentIdOf(agent),
                    ...folded?.usage === undefined ? {} : { usage: { ...folded.usage } },
                };
                if (folded !== undefined)
                    turns.delete(session.id);
                detached.track('turn.complete', engine.raise('turn.complete', input, () => ({ text: '' }), { binding: { agent }, signal: detached.controller.signal }).then((result) => {
                    if (typeof result.text === 'string' && result.text.length > 0)
                        ctx.logger.info(`claude-code-mods: ${result.text}`);
                    redraw(session.id);
                }));
            });
        }
        /**
         * Watch the band above the prompt of one session: the current drawing, then
         * every redraw, until the Client stops watching.
         * @param agent - the session's agent, resolved by the Gateway.
         * @param signal - carrier cancellation.
         * @returns the band's snapshots.
         */
        watchBand(agent, signal) {
            return this.surfaces.watch(agent.session.id, signal);
        }
        /**
         * Press a button of the band's current drawing: runs the mod's `onPress` and redraws.
         * @param agent - the session's agent, resolved by the Gateway.
         * @param generation - the drawing the Client saw.
         * @param actionId - the button's action id in that drawing.
         * @returns the snapshot after the press.
         */
        pressBand(agent, generation, actionId) {
            return this.surfaces.press(agent.session.id, generation, actionId);
        }
        /**
         * Load one mod beneath every mod loaded before it: run its `register`,
         * keep its hooks, and report which of its events this host never raises.
         * @param definition - the mod as its plugin defined it.
         * @returns the disposer that removes the mod's hooks, closes its timers, and releases its registrations.
         * @throws Error when the name is invalid or taken, or when `register` throws (Claude Code's `hooks module did not load` wording).
         */
        async add(definition) {
            const mod = await this.engine.add(definition);
            const unserved = this.engine.registry.unserved(mod, SERVED_EVENTS);
            this.ctx.logger.info(`claude-code-mods: hooks module ${mod.name}@inline loaded (tier user); events: ${this.engine.describe(mod) || '(none)'}`);
            if (unserved.length > 0) {
                this.ctx.logger.warn(`claude-code-mods: ${mod.name}: on(${unserved.map(event => JSON.stringify(event)).join(', ')}) registered, but this host never raises ${unserved.length === 1 ? 'that event' : 'those events'}`);
            }
            return async () => {
                await this.engine.unload(mod.name);
            };
        }
        /** The loaded mods in chain order. */
        get mods() {
            return this.engine.registry.list();
        }
    };
})();
export { ClaudeCodeMods };
export default ClaudeCodeMods;
//# sourceMappingURL=index.js.map