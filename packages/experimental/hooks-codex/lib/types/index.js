/**
 * Bridge for unmodified Codex command hooks on harness interception points. It
 * supports five points (SessionStart, prompt/tool pre/post, Stop), regex-only
 * matchers, snake_case payloads without a trailing newline, no hook environment
 * or command substitution, and no pre-tool approval or rewrite path; only
 * blocking decisions are honored. Shared execution and parsing live in
 * `dsh-hook-protocol`.
 * @module @deepseek-ai/dsh-hooks-codex
 */
import { readFileSync } from 'node:fs';
import z from '@deepseek-ai/schemastery';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { appendHookInvoked, appendHookResult, createDetachedRuns, DEFAULT_HOOK_TIMEOUT_MS, DEFAULT_STDERR_SUMMARY_MAX_CHARS, mergeHookOutputs, runHook, selectHookGroups, } from '@deepseek-ai/dsh-hook-protocol';
import { parseCodexConfig } from "./config.js";
/* jscpd:ignore-end */
export const name = 'hooks-codex';
export const inject = ['shell', 'sessionProjections', 'workingDirectory'];
export const Config = z.object({
    configPath: z.string().required(),
    model: z.string().default(''),
    defaultTimeoutMs: z.number().default(DEFAULT_HOOK_TIMEOUT_MS),
    stderrSummaryMaxChars: z.number().default(DEFAULT_STDERR_SUMMARY_MAX_CHARS),
});
let handlerCounter = 0;
function nextHandlerId(point) {
    return `codex:${point}:${++handlerCounter}`;
}
const CONTEXT_SOURCE = { kind: 'hooks-codex' };
/** The summary cap bounds a persisted event field — a positive integer or the slice misbehaves silently. */
function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`hooks-codex: ${name} must be a positive integer`);
    }
}
export function apply(ctx, config) {
    // Validate before config parsing so a bad value cannot be hidden by its early return.
    const stderrSummaryMaxChars = config.stderrSummaryMaxChars ?? DEFAULT_STDERR_SUMMARY_MAX_CHARS;
    assertPositiveInteger('stderrSummaryMaxChars', stderrSummaryMaxChars);
    const defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;
    let parsed = {};
    try {
        const raw = JSON.parse(readFileSync(config.configPath, 'utf8'));
        const result = parseCodexConfig(raw);
        parsed = result.config;
        for (const s of result.skipped) {
            ctx.logger.warn(`hooks-codex: skipping ${s.reason} on ${s.event} (only sync command hooks run)`);
        }
    }
    catch (error) {
        ctx.logger.warn(`hooks-codex: could not load hook config "${config.configPath}": ${String(error)} — no hooks registered`);
        return;
    }
    const model = config.model ?? '';
    // SessionStart is the one emit-shaped (detached) point Codex has: track its
    // run chains so disposal aborts a still-running hook process and drains the
    // continuation (docs/defensive-patterns.md: dispose must reach quiescence).
    const detached = createDetachedRuns();
    ctx.effect(() => () => detached.drain(), 'hooks-codex: drain detached hook runs');
    /**
     * Run and fold one configured Codex hook point.
     *
     * A supplied turn records the hook invocation/result pair inside that open turn.
     * Detached lifecycle points omit it.
     */
    async function runPoint(point, matchQuery, payload, opts) {
        const groups = selectHookGroups(parsed[point], matchQuery, 'codex');
        if (groups.length === 0)
            return mergeHookOutputs([]);
        const outputs = [];
        const workdir = opts.agent === undefined ? undefined : await ctx.workingDirectory.ensure(opts.agent, opts.signal);
        for (const group of groups) {
            for (const hook of group.hooks) {
                const handlerId = nextHandlerId(point);
                const session = opts.agent?.session;
                if (session && opts.turn !== undefined) {
                    appendHookInvoked(session, {
                        turn: opts.turn, point, dialect: 'codex', handlerId,
                        matcher: group.matcher,
                    });
                }
                const { output, durationMs } = await runHook(ctx.shell, hook, {
                    payload: { ...payload, cwd: workdir ?? process.cwd() },
                    defaultTimeoutMs,
                    ...workdir !== undefined ? { cwd: workdir } : {},
                    signal: opts.signal,
                    trailingNewline: false, // Codex writes stdin without a trailing newline.
                    // Discard a `hookSpecificOutput` block naming a different event.
                    expectedEventName: point,
                }, () => performance.now());
                // Clean plain stdout becomes context only when no structured context
                // exists; nonzero output and raw JSON never leak as prose.
                if (opts.plainStdoutAsContext === true && output.exitCode === 0
                    && output.additionalContext === undefined
                    && output.stdout.length > 0 && !output.stdout.startsWith('{')) {
                    output.additionalContext = output.stdout;
                }
                outputs.push(output);
                // Execution and decision mapping remain in each bridge so dialect
                // differences stay explicit at their owning extension point.
                /* jscpd:ignore-start */
                if (output.systemMessage !== undefined) {
                    ctx.logger.warn(`hooks-codex: ${point} hook emitted a systemMessage, which is not yet surfaced (ignored)`);
                }
                if (session && opts.turn !== undefined) {
                    appendHookResult(session, { turn: opts.turn, point, handlerId, output, stderrSummaryMaxChars, durationMs });
                }
            }
        }
        return mergeHookOutputs(outputs);
    }
    // TODO(hook-continue-false): `merged.stop` is logged but needs a run-level halt mechanism.
    function contextFrom(merged) {
        if (merged.additionalContext.length === 0)
            return undefined;
        const content = merged.additionalContext.map(text => ({ type: 'text', text }));
        return createUserMessage({ content, source: CONTEXT_SOURCE });
    }
    /** Prepend one context without flattening source fields or other downstream metadata. */
    function prependContext(ours, theirs) {
        return [ours, ...theirs ?? []];
    }
    ctx.on('agent/created', async ({ agent, source, signal }) => {
        const ownerSignal = signal === undefined ? detached.signal : AbortSignal.any([signal, detached.signal]);
        const run = runPoint('SessionStart', source, { ...base(agent, 'SessionStart', model), source }, { agent, plainStdoutAsContext: true, signal: ownerSignal })
            .then((merged) => {
            const context = contextFrom(merged);
            if (context)
                agent.inject(context);
        })
            .catch((error) => { ctx.logger.warn(`hooks-codex: SessionStart hook failed: ${String(error)}`); });
        detached.track(run);
        await run;
        /* jscpd:ignore-end */
    });
    // UserPromptSubmit → PreStepDecision. Codex supports reject, not rewrite or ask.
    ctx.on('agent/pre-step', async ({ agent, messages, turn, signal }, next) => {
        if (messages.length === 0)
            return next();
        const payload = {
            ...base(agent, 'UserPromptSubmit', model),
            turn_id: String(turn),
            prompt: blocksToText(messages.flatMap(message => message.content)),
        };
        const merged = await runPoint('UserPromptSubmit', '', payload, {
            agent, turn, plainStdoutAsContext: true, signal,
        });
        /* jscpd:ignore-start */
        if (merged.decision === 'deny') {
            return { kind: 'reject' };
        }
        // Context alone is not a veto: DELEGATE so a later pre-step listener can
        // still reject/rewrite, then fold our context onto its decision.
        const downstream = await next();
        const ours = contextFrom(merged);
        if (!ours || downstream.kind !== 'enter')
            return downstream;
        return {
            ...downstream,
            messages: [...downstream.messages, ours],
        };
    });
    // PreToolUse → PreToolDecision. Codex blocks only (no allow/ask honored).
    ctx.on('tools/pre-execute', async (exec, next) => {
        const turn = lastTurn(ctx, exec.agent);
        const merged = await runPoint('PreToolUse', exec.name, preToolPayload(ctx, exec, model), { ...exec.agent ? { agent: exec.agent } : {}, turn, signal: exec.signal });
        /* jscpd:ignore-end */
        if (merged.decision === 'deny')
            return { kind: 'deny', reason: merged.reason ?? 'blocked by PreToolUse hook' };
        return next();
    });
    // PostToolUse → PostToolDecision (block with feedback, or attach context).
    ctx.on('tools/post-execute', async (exec, result, next) => {
        const turn = lastTurn(ctx, exec.agent);
        /* jscpd:ignore-start */
        const merged = await runPoint('PostToolUse', exec.name, postToolPayload(ctx, exec, result, model), { ...exec.agent ? { agent: exec.agent } : {}, turn, signal: exec.signal });
        const context = contextFrom(merged);
        if (merged.decision === 'deny') {
            return { kind: 'block', feedback: [{ type: 'text', text: merged.reason ?? 'blocked by PostToolUse hook' }], ...context ? { additionalContexts: [context] } : {} };
        }
        // Context alone is not a veto: DELEGATE, then fold our context onto the
        // downstream decision (a downstream block carries it too).
        const downstream = await next();
        if (!context)
            return downstream;
        if (downstream.kind === 'block') {
            return { ...downstream, additionalContexts: prependContext(context, downstream.additionalContexts) };
        }
        return {
            ...downstream,
            additionalContexts: prependContext(context, downstream.additionalContexts),
        };
    });
    // A blocking Stop hook steers at the stopping boundary, which makes the
    // machine observe pending input and run another step.
    // TODO(stop-loop-guard): Codex supplies `stop_hook_active` so a Stop hook can
    // avoid continuing the same turn indefinitely. It is always false here, so an
    // unconditionally blocking hook force-continues every step until it self-limits.
    ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
        const merged = await runPoint('Stop', '', { ...turnBase(ctx, agent, 'Stop', model), stop_hook_active: false, last_assistant_message: null }, { agent, turn, signal });
        /* jscpd:ignore-end */
        if (merged.decision === 'deny') {
            // A blocking Stop hook forces continuation; a block with no reason (exit 2,
            // empty stderr) still forces it — fall back to a generic steering line
            // rather than letting the turn stop.
            const text = merged.reason ?? 'continue: blocked by Stop hook';
            agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: CONTEXT_SOURCE }));
        }
    });
}
// --- Codex DIALECT payloads: snake_case, model on every event, turn_id on
// turn-scoped events. ---
// These small payload helpers intentionally remain next to the dialect shape;
// sharing them would pull bridge-only agent/LLM dependencies into hook-protocol.
/* jscpd:ignore-start */
function lastTurn(ctx, agent) {
    if (!agent)
        return 0;
    /* v8 ignore next -- agent-present hook points run inside AgentLoop, which owns this projection. */
    return ctx.sessionProjections.stateOf(agent.session, 'turnBoundary')?.lastTurn ?? 0;
}
function blocksToText(content) {
    return content.filter((b) => b.type === 'text').map(b => b.text).join('');
}
/* jscpd:ignore-end */
/** Base fields on every Codex payload (no turn_id). */
function base(agent, event, model) {
    return {
        session_id: agent?.session.header.id ?? '',
        // The persistence seam exposes no artifact path; the field stays null
        // (a durable consumer gap recorded in this package's README).
        transcript_path: null,
        hook_event_name: event,
        model,
        permission_mode: 'default',
    };
}
/** Base + turn_id, for the turn-scoped events (PreToolUse/PostToolUse/UserPromptSubmit/Stop). */
function turnBase(ctx, agent, event, model) {
    return { ...base(agent, event, model), turn_id: String(lastTurn(ctx, agent)) };
}
/** Extract a `command` string from a tool call's parsed arguments, else ''. */
function commandOf(args) {
    if (typeof args === 'object' && args !== null && 'command' in args) {
        const command = args.command;
        if (typeof command === 'string')
            return command;
    }
    return '';
}
function preToolPayload(ctx, exec, model) {
    // `tool_name` is the REAL tool name (matching the `exec.name` matcher subject);
    // a hardcoded constant would disagree with what the matcher tests and make a
    // config's tool matcher never fire. `tool_input` keeps Codex's `{ command }`
    // shape (its shell payload), derived from the call's `command` arg when present.
    return { ...turnBase(ctx, exec.agent, 'PreToolUse', model), tool_name: exec.name, tool_input: { command: commandOf(exec.arguments) }, tool_use_id: exec.callId };
}
function postToolPayload(ctx, exec, result, model) {
    return { ...turnBase(ctx, exec.agent, 'PostToolUse', model), tool_name: exec.name, tool_input: { command: commandOf(exec.arguments) }, tool_use_id: exec.callId, tool_response: blocksToText(result.content) };
}
//# sourceMappingURL=index.js.map