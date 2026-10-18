/**
 * A test kit in the shape of `claude-code/testing`: load mods, register
 * stubs that answer in the engine's place beneath every mod, raise events
 * through the mods' hooks, and mount a surface to assert what a mod draws —
 * no session, agent, or harness service involved. This repository's test
 * setup wraps it as `claude-code/testing` for the example mods' own tests.
 * @module
 */
import { findAll, renderText, treeProblem } from "./elements.js";
import { ModsEngine, OpDenied } from "./engine.js";
/** Stubs that answer a whole namespace from memory. */
export const mock = Object.freeze({
    /**
     * Answer `$.store` from an in-memory map.
     * @param on - the kit's `on`.
     * @param initial - entries the store starts with.
     * @returns the live map, to read what the mod saved.
     */
    store(on, initial = {}) {
        const saved = new Map(Object.entries(initial));
        on('store.get', (_$, e) => ({ value: saved.get(e.key) }));
        on('store.set', (_$, e) => {
            saved.set(e.key, e.value);
            return { value: undefined };
        });
        on('store.delete', (_$, e) => {
            saved.delete(e.key);
            return { value: undefined };
        });
        on('store.keys', () => ({ value: [...saved.keys()] }));
        return saved;
    },
    /**
     * Answer `$.env.get` from fixed variables and record `$.env.set` writes.
     * @param on - the kit's `on`.
     * @param variables - the environment the mod sees.
     * @returns the live record, to read what the mod set.
     */
    env(on, variables = {}) {
        const env = { ...variables };
        on('env.get', (_$, e) => ({ value: env[e.name] }));
        on('env.set', (_$, e) => {
            env[e.name] = e.value;
            return { value: undefined };
        });
        return env;
    },
    /**
     * Answer `$.clock.now` from a settable instant and `$.clock.sleep` at once, advancing it.
     * @param on - the kit's `on`.
     * @param startAt - the first `now()`, in epoch milliseconds.
     * @returns the clock, to read or advance `now`.
     */
    clock(on, startAt = 0) {
        const clock = {
            now: startAt,
            advance(ms) { clock.now += ms; },
        };
        on('clock.now', () => ({ value: clock.now }));
        on('clock.sleep', (_$, e) => {
            clock.now += e.ms;
            return { value: undefined };
        });
        return clock;
    },
});
/** Engine events whose default answer mirrors Claude Code's test-kit table when no stub is registered. */
const DEFAULT_ENGINE_ANSWERS = {
    'session.start': (e) => ({ cwd: e.cwd }),
    'session.end': (e) => ({ sessionId: e.sessionId }),
    'turn.start': (e) => ({ turnId: e.turnId }),
    'turn.complete': () => ({ text: '' }),
    'prompt.submit': (e) => ({ text: e.text, ...e.context === undefined ? {} : { context: e.context } }),
    'command.run': () => ({}),
    'ui.render': () => null,
};
/** Mods API calls the kit answers itself, as Claude Code's kit does. */
const DEFAULT_OP_ANSWERS = {
    'ui.invalidate': () => ({ value: undefined }),
    'ui.open': (_$, e) => ({ value: { id: e.id, isPlaced: false } }),
    'ui.close': () => ({ value: undefined }),
};
function definitionOf(mod) {
    return 'definition' in mod ? mod.definition : mod;
}
/**
 * Load mods for a test and return the kit.
 * @param options - the mods to load and the hook time limit.
 * @returns the kit, with every mod's `register` already run.
 */
export async function createModTestKit(options = {}) {
    const reports = [];
    const stubs = new Map();
    const engine = new ModsEngine({
        ops: (op) => {
            const stub = stubs.get(op) ?? DEFAULT_OP_ANSWERS[op];
            return stub === undefined ? undefined : opStub(op, stub);
        },
        stateKey: () => 'test',
        budgetMs: options.budgetMs ?? 5_000,
        catchBudgetMs: 1_000,
        report: (line) => { reports.push(line); },
    });
    const kitMod = Object.freeze({
        name: 'claude-code-testing', version: undefined, root: process.cwd(), options: Object.freeze({}), order: Number.MAX_SAFE_INTEGER,
    });
    const binding = {};
    const signal = new AbortController().signal;
    function opStub(op, stub) {
        return async (input) => {
            const answer = await stub(engine.api(kitMod, undefined, binding, signal), input);
            if (typeof answer !== 'object' || answer === null)
                throw new Error(`${op}: a stub returned neither { value } nor { deny }`);
            const result = answer;
            if (typeof result.deny === 'string')
                throw new OpDenied(result.deny);
            if (!('value' in result))
                throw new Error(`${op}: a stub returned neither { value } nor { deny }`);
            return result.value;
        };
    }
    for (const entry of options.mods ?? []) {
        const definition = definitionOf(entry);
        await engine.add({ ...definition, options: { ...definition.options, ...options.options?.[definition.name] } });
    }
    function raise(event, input) {
        return engine.raise(event, input, async (e) => {
            const stub = stubs.get(event);
            if (stub !== undefined) {
                const answer = await stub(engine.api(kitMod, undefined, binding, signal), e);
                if (typeof answer !== 'object' || answer === null)
                    throw new Error(`${event}: the stub returned no result`);
                return answer;
            }
            const fallback = DEFAULT_ENGINE_ANSWERS[event];
            if (fallback === undefined)
                throw new Error(`no implementation for ${event}`);
            return fallback(e);
        }, { binding, signal });
    }
    let calls = 0;
    const mounted = new Set();
    async function render(args) {
        const props = args.props ?? {};
        const columns = typeof props['bodyColumns'] === 'number' ? props['bodyColumns'] : 80;
        const input = {
            component: args.component,
            surface: args.requestId ?? args.component,
            ...args.requestId === undefined ? {} : { requestId: args.requestId },
            props,
            viewport: { columns },
        };
        const tree = await raise('ui.render', input);
        const problem = treeProblem(tree);
        if (problem !== undefined)
            throw new Error(`ui.render returned a tree that does not validate: ${problem}`);
        return tree;
    }
    function mountedElement(element, redraw) {
        return {
            element,
            type: element.type,
            text: renderText(element),
            async press() {
                const onPress = element.props['onPress'];
                if (element.type !== 'Button' || typeof onPress !== 'function')
                    throw new Error(`press() needs a Button with onPress, not a ${element.type}`);
                await onPress();
                await redraw();
            },
        };
    }
    return {
        on: (event, stub) => {
            stubs.set(event, stub);
        },
        raise,
        $: {
            tool: {
                call: input => raise('tool.call', { tool_use_id: `test-${++calls}`, ...input }),
            },
            command: {
                run: input => raise('command.run', { ...input, origin: { kind: 'composer' } }),
            },
            prompt: {
                submit: input => raise('prompt.submit', { wait: false, origin: { kind: 'composer' }, ...input }),
            },
            session: {
                start: (input = {}) => raise('session.start', { cwd: process.cwd(), surface: null, isInteractive: true, ...input }),
                end: (input = {}) => raise('session.end', { reason: 'other', sessionId: 'test', ...input }),
            },
            turn: {
                start: input => raise('turn.start', { text: '', ...input }),
                complete: (input = {}) => raise('turn.complete', {
                    turnId: '1', answer: '', durationMs: 0, isAborted: false, reason: 'answer', ...input,
                }),
            },
            ui: {
                mount: async (args) => {
                    const key = args.requestId ?? args.component;
                    if (mounted.has(key))
                        throw new Error(`surface ${key} is already mounted`);
                    mounted.add(key);
                    const redraw = () => render(args);
                    await redraw();
                    return {
                        tree: redraw,
                        text: async () => renderText(await redraw()),
                        find: async (pattern) => findAll(await redraw(), pattern).map(element => mountedElement(element, redraw))[0],
                        findAll: async (pattern) => findAll(await redraw(), pattern).map(element => mountedElement(element, redraw)),
                        unmount: () => {
                            mounted.delete(key);
                            return Promise.resolve();
                        },
                    };
                },
            },
        },
        reports,
        get mods() {
            return engine.registry.list();
        },
        dispose() {
            return engine.dispose();
        },
    };
}
//# sourceMappingURL=testing.js.map