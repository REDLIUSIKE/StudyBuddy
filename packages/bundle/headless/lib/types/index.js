/**
 * @deepseek-ai/dsh-headless — one-shot direct Agent driver. The bundle patch
 * rides over dsh-base without Host, HTTP, or browser plugins; this runner
 * creates one Agent through the core registry (or adopts the exact Session a
 * `--session-id` names), drives the task to quiescence, streams provider
 * reasoning to stderr, flushes its Session, prints the final assistant text to
 * stdout, and exits. With `--json` it projects the run as newline-delimited
 * events instead of the final text.
 *
 * @module @deepseek-ai/dsh-headless
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { randomUUID } from 'node:crypto';
import z from '@deepseek-ai/schemastery';
import { brandString } from '@deepseek-ai/dsh-brand';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { assertNever } from '@deepseek-ai/dsh-util-values';
import { SessionSeq } from '@deepseek-ai/dsh-session';
import { SessionQueryError } from '@deepseek-ai/dsh-session-query';
import { internals } from "./runner-internals.js";
import { projectJsonRun, boundJsonLine } from "./json-stream.js";
/** Stable Cordis plugin name. */
export const name = 'headless-runner';
/** Core services required before the one-shot turn can start. */
export const inject = ['agentDefaultModel', 'agents', 'sessions'];
export const Config = z.object({
    task: z.string(),
    sessionId: z.string(),
    json: z.boolean(),
});
/** Aggregate the last assistant text and turn outcome in one owned interval. */
function summarize(session, firstSeq) {
    let started = false;
    let text = '';
    let reason;
    const length = session.seq;
    for (let seq = firstSeq; seq < length; seq++) {
        // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
        const event = session.eventAt(SessionSeq(seq));
        if (event === undefined) {
            throw new Error(`headless summary cannot read seq ${String(seq)} below captured length ${String(length)}`);
        }
        if (event.type === 'turn/start') {
            started = true;
            continue;
        }
        if (!started)
            continue;
        if (event.type === 'assistant/message') {
            const joined = event.data.message.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('');
            if (joined !== '')
                text = joined;
        }
        if (event.type === 'turn/end')
            reason = event.data.reason;
    }
    return { text, reason };
}
/**
 * Project provider-reported reasoning from one owned run to stderr as it is
 * streamed, while keeping final outcome derivation on the durable log.
 * @param ctx - plugin context carrying the live Assistant frame feed.
 * @param agent - the exact Agent whose reasoning belongs to this invocation.
 * @param stderr - progress output sink.
 * @returns a disposer that also terminates an unterminated reasoning line.
 */
function streamReasoning(ctx, agent, stderr) {
    let open = false;
    let endsWithNewline = true;
    const close = () => {
        if (!open)
            return;
        if (!endsWithNewline)
            stderr.write('\n');
        open = false;
        endsWithNewline = true;
    };
    const dispose = ctx.on('agent/assistant-stream', ({ agent: subject, frame }) => {
        if (subject !== agent)
            return;
        if (frame.type === 'start') {
            close();
            return;
        }
        if (frame.type === 'end') {
            close();
            return;
        }
        const chunk = frame.chunk;
        switch (chunk.type) {
            case 'reasoning-delta':
                if (chunk.text === '')
                    return;
                if (!open) {
                    stderr.write('dsh: reasoning:\n');
                    open = true;
                }
                stderr.write(chunk.text);
                endsWithNewline = chunk.text.endsWith('\n');
                return;
            case 'block-start':
                if (chunk.blockType !== 'reasoning')
                    close();
                return;
            case 'block-end':
                if (chunk.block.type !== 'reasoning')
                    close();
                return;
            case 'usage':
                return;
            case 'text-delta':
            case 'tool-call-delta':
            case 'finish':
                close();
                return;
            /* v8 ignore next -- closed-union exhaustiveness guard */
            default:
                return assertNever(chunk, 'headless reasoning stream');
        }
    });
    return () => {
        dispose();
        close();
    };
}
/** Iterate a live Session's durable events in order. */
function* liveEvents(session) {
    const length = session.seq;
    for (let seq = 0; seq < length; seq++) {
        // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
        const event = session.eventAt(SessionSeq(seq));
        if (event === undefined) {
            throw new Error(`headless adoption cannot read seq ${String(seq)} below captured length ${String(length)}`);
        }
        yield event;
    }
}
/**
 * The preset a Session currently runs under: its creation header advanced by
 * the last `agent-preset/selected` event. The header is only a creation fact;
 * the presets plugin reconstructs a session's composition from the projection.
 */
function currentPreset(header, events, sessionId) {
    let preset = header.agentPreset;
    for (const event of events) {
        // Owned by dsh-agent-preset-registry, which this bundle does not compose, so the
        // event is read structurally rather than through its module augmentation.
        const candidate = event;
        if (candidate.type !== 'agent-preset/selected')
            continue;
        const selected = candidate.data?.agentPreset;
        // A corrupt record must not read as "no preset": that would let the run
        // continue under this bundle's composition instead of the recorded one.
        if (typeof selected !== 'string' || selected === '') {
            throw new Error(`session "${sessionId}" records a malformed agent-preset/selected event and cannot be adopted`);
        }
        preset = selected;
    }
    return preset;
}
/** Reject a Session the one-shot runner must not adopt. */
function assertAdoptable(header, events, sessionId, cwd) {
    const preset = currentPreset(header, events, sessionId);
    if (preset !== undefined) {
        // This bundle composes no preset roster, so resuming the session here would
        // silently run it under the headless tools and prompts instead of the
        // composition its log records.
        throw new Error(`session "${sessionId}" runs under agent preset "${preset}", which the one-shot runner does not compose`);
    }
    if (header.origin === 'subagent' || header.parentSession !== undefined) {
        throw new Error(`session "${sessionId}" is a subagent or forked session and cannot be driven directly`);
    }
    if (header.cwd === undefined) {
        throw new Error(`session "${sessionId}" recorded no working directory, so it cannot be adopted`);
    }
    if (header.cwd !== cwd) {
        throw new Error(`session "${sessionId}" was recorded in "${header.cwd}", not "${cwd}"`);
    }
}
/**
 * Resolve the Agent for one run: adopt the persisted Session with the requested
 * id. The identity must already exist, and no Agent may be live under it; a
 * first round omits the option instead, so a typo cannot pass as a brand-new
 * conversation.
 * @param ctx - plugin context carrying the Session query service.
 * @param agents - the core Agent registry.
 * @param sessionId - exact Session identity to adopt.
 * @param agentOptions - provider/model pair for this run.
 * @param setup - per-Agent scope setup installing the model selection.
 * @param cwd - working directory resolved in the mounted filesystem.
 * @returns the resumed Agent.
 */
async function resolveAgent(ctx, agents, sessionId, agentOptions, setup, cwd) {
    // Resuming promises the caller a log a later process can continue. Without a
    // durable log the run would succeed, print the id, and still lose the whole
    // history at exit, so a miscomposed profile fails loud before the resume.
    if (ctx.get('sessionPersistence') === undefined) {
        throw new Error('headless --session-id requires the sessionPersistence service; the Session would not survive this process');
    }
    // A later process holds no live Agent and has to find the id through the
    // query service, so every --session-id run requires it.
    const query = ctx.get('sessionQuery');
    if (query === undefined) {
        throw new Error('headless --session-id requires the sessionQuery service; dsh-base provides it');
    }
    const live = agents.get(sessionId);
    if (live !== undefined) {
        // A live Agent already has an owner that may still drive it, and `whenIdle`
        // is not a single-message signal: folding its next interval into this run
        // would mix that owner's events — even its final answer — into the stream.
        // The runner cannot claim an exclusive interval over an Agent it did not
        // create, so it refuses the identity; the adoptability rules run first so a
        // real mismatch is named instead of the generic refusal.
        assertAdoptable(live.session.header, liveEvents(live.session), sessionId, cwd);
        throw new Error(`session "${sessionId}" is live in this process, so the one-shot runner cannot own an exclusive run interval`);
    }
    try {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const observation = __addDisposableResource(env_1, await query.observeSession(sessionId), false);
            assertAdoptable(observation.header, observation.events, sessionId, cwd);
            const { agent } = await agents.resume({ resumeSessionId: sessionId, agentOptions, setup });
            // The observation is a snapshot: another writer may have appended a preset
            // selection before this process took the write lease. Re-check the log
            // resume actually attached, now that no other process can append.
            assertAdoptable(agent.session.header, liveEvents(agent.session), sessionId, cwd);
            return agent;
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    catch (error) {
        if (!(error instanceof SessionQueryError) || error.code !== 'SESSION_QUERY_SESSION_NOT_FOUND')
            throw error;
        // --session-id resumes a conversation that already exists; starting a new
        // one is the no-id path, which generates its own identity and reports it in
        // the `session` event. Creating the requested id here would turn a typo
        // into a brand-new empty history the caller believes it is continuing.
        throw new Error(`session "${sessionId}" does not exist; omit --session-id to start a new Session`);
    }
}
/** Report an unexpected direct-driver failure and request a failing exit. */
function fail(io, error, json) {
    const message = error instanceof Error ? error.message : String(error);
    if (json)
        io.stdout.write(`${boundJsonLine({ type: 'error', message })}\n`);
    io.stderr.write(`dsh: ${message}\n`);
    io.exit(1);
}
/**
 * Run one task through one Agent and request process exit.
 * Live Agent failures require a later durable terminal before a recovered run can succeed.
 * @param ctx - plugin context carrying the Agent, default model, Session, and launcher IO services.
 * @param config - task, optional exact Session identity, and output mode.
 * @param io - process-facing effects.
 */
async function run(ctx, config, io) {
    // Loader siblings mount concurrently. Await the complete application before
    // creating an Agent so its scoped tools and adapters are not half-composed.
    await ctx.get('loader')?.await();
    const agents = ctx.get('agents');
    const defaultModel = ctx.get('agentDefaultModel');
    const sessions = ctx.get('sessions');
    // Early process shutdown can dispose the tree while settlement is pending.
    if (agents === undefined || defaultModel === undefined || sessions === undefined)
        return;
    // A Cordis overlay sets the row directly and bypasses the CLI trim check, so
    // the same public setting must fail here rather than become a blank identity.
    if (config.sessionId !== undefined && config.sessionId.trim() === '') {
        throw new Error('headless-runner: sessionId must not be blank');
    }
    const task = config.task === undefined || config.task === '-'
        ? await internals.readStdin()
        : config.task;
    if (task.trim() === '') {
        throw new Error('a task is required, for example: dsh --profile headless "run the tests"');
    }
    const selection = defaultModel.currentSelection();
    const agentOptions = { provider: selection.provider, model: selection.model };
    // This bundle composes no preset roster, so the model-facing rows sit in the
    // host plane and the agent reads them from the global layer. A deployment
    // that DOES configure one has to join it here first
    // (@deepseek-ai/dsh-agent-preset-registry README, "Composing a child agent").
    const setup = (agentCtx) => {
        const selected = { current: selection, assembled: undefined };
        installModelSelection(agentCtx, selected);
    };
    const sessionId = brandString(config.sessionId ?? `session-${randomUUID()}`);
    const fs = ctx.get('fs');
    const cwd = fs === undefined ? process.cwd() : fs.processPath(await fs.resolve('.'));
    const agent = config.sessionId === undefined
        ? (await agents.create({
            sessionId,
            meta: { cwd },
            agentOptions,
            setup,
        })).agent
        : await resolveAgent(ctx, agents, sessionId, agentOptions, setup, cwd);
    await agent.whenIdle();
    if (config.sessionId !== undefined) {
        // The resume-time check read a snapshot; an overlay can still append a
        // preset selection between it and the interval this run now owns, so
        // re-read the log the runner holds before submitting the task.
        assertAdoptable(agent.session.header, liveEvents(agent.session), sessionId, cwd);
    }
    const firstSeq = agent.session.seq;
    const projection = config.json === true ? projectJsonRun(ctx, agent, io.stdout, { cwd }) : undefined;
    const stopReasoning = projection === undefined ? streamReasoning(ctx, agent, io.stderr) : undefined;
    let failure;
    const stopErrors = ctx.on('agent/error', ({ agent: subject, error }) => {
        if (subject === agent)
            failure = { error, atOffset: agent.session.seq };
    });
    const stopTerminals = ctx.on('session/event', (session, event) => {
        if (session === agent.session && event.type === 'turn/end'
            && failure !== undefined && event.seq >= failure.atOffset)
            failure = undefined;
    });
    try {
        try {
            agent.followup(createUserMessage({
                content: [{ type: 'text', text: task }],
                source: { kind: 'user' },
            }));
            const subagents = ctx.get('subagents');
            while (true) {
                await agent.whenIdle();
                const idleSeq = agent.session.seq;
                // Child settlement can wake the parent before the child wait observes it.
                if (!await subagents?.waitForChildren(agent)
                    && agent.status === 'idle' && agent.session.seq === idleSeq)
                    break;
            }
        }
        finally {
            stopReasoning?.();
        }
        await sessions.flush(agent.session);
        if (failure !== undefined)
            throw failure.error;
        const outcome = summarize(agent.session, firstSeq);
        if (projection === undefined)
            io.stdout.write(outcome.text + '\n');
        else
            projection.finish(outcome.text);
        if (outcome.reason?.kind === 'error') {
            io.stderr.write(`dsh: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`);
        }
        io.exit(outcome.reason?.kind === 'completed' ? 0 : 1);
    }
    finally {
        stopErrors();
        stopTerminals();
        projection?.dispose();
    }
}
/**
 * Mount the one-shot direct driver.
 * @param ctx - plugin context carrying core services and the launcher-provided exit request.
 * @param config - validated task and run options.
 */
export function apply(ctx, config) {
    // Read through the global service store, not the property proxy: appExit is
    // an optional host value, never an injected dependency.
    const exit = ctx.get('appExit');
    if (exit === undefined) {
        throw new Error('headless-runner: the launcher must provide ctx.appExit before the tree mounts');
    }
    const io = { stdout: internals.stdout, stderr: internals.stderr, exit };
    void run(ctx, config, io).catch((error) => { fail(io, error, config.json === true); });
}
//# sourceMappingURL=index.js.map