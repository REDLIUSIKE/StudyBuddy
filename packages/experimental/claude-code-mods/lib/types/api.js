/**
 * The `$` a hook receives. Each method shapes its arguments into the mods API
 * event of the same name and hands it to the binding's `invoke`, which runs
 * the mods loaded before this one and then the engine's implementation. The
 * hook's running-time clock pauses while a call is awaited, except for
 * `$.clock.sleep`, which Claude Code counts as the hook's own time.
 * @module
 */
import { uiElements } from "./elements.js";
import { messageOf } from "./values.js";
/**
 * Build the `$` for one hook invocation.
 * @param binding - the mod, clock, and engine entry points this instance uses.
 * @returns the mods API.
 */
export function createModsApi(binding) {
    const { mod, clock, timers } = binding;
    async function call(op, input) {
        clock?.pause();
        try {
            return await binding.invoke(op, input);
        }
        finally {
            clock?.resume();
        }
    }
    function fire(op, input) {
        call(op, input).catch((error) => {
            binding.report(`${mod.name}: $.${op} failed: ${messageOf(error)}`);
        });
    }
    // Not frozen: the proxy below returns a wrapped namespace, which a frozen target's invariant would forbid.
    const served = {
        plugin: Object.freeze({ name: mod.name, root: mod.root }),
        ui: Object.freeze({
            log(text, options) {
                fire('ui.log', { text, to: options?.to ?? 'transcript' });
            },
            toast(text, options) {
                fire('ui.toast', { text, ...options?.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs } });
            },
            status(text) {
                fire('ui.status', { text });
            },
            invalidate(event) {
                fire('ui.invalidate', { event });
            },
            open(pane) {
                return call('ui.open', pane);
            },
            close(pane) {
                return call('ui.close', { id: pane.id, origin: 'plugin' });
            },
            panes() {
                return call('ui.panes', {});
            },
            ask(question, options) {
                const normalized = Array.isArray(options) ? { options } : options ?? {};
                return call('ui.ask', { question, ...normalized });
            },
            resolve: () => uiElements(),
        }),
        command: Object.freeze({
            register(command) {
                return call('command.register', command);
            },
            run(input) {
                return call('command.run', { command: input.command, args: input.args ?? '' });
            },
            list() {
                return call('command.list', {});
            },
        }),
        tool: Object.freeze({
            register(tool) {
                return call('tool.register', tool);
            },
            call(input) {
                return call('tool.call', input);
            },
            list() {
                return call('tool.list', {});
            },
        }),
        prompt: Object.freeze({
            submit(input) {
                return call('prompt.submit', { text: input.text, asUser: input.asUser === true });
            },
        }),
        session: Object.freeze({
            id: () => call('session.id', {}),
            cwd: () => call('session.cwd', {}),
            root: () => call('session.root', {}),
            model: () => call('session.model', {}),
            turns: () => call('session.turns', {}),
            messages: () => call('session.messages', {}),
            usage: () => call('session.usage', {}),
            version: () => call('session.version', {}),
        }),
        state: Object.freeze({
            get(ref) {
                return call('state.get', { plugin: ref.plugin, key: ref.key });
            },
            set(ref, value) {
                return call('state.set', { plugin: ref.plugin, key: ref.key, value });
            },
        }),
        store: Object.freeze({
            get: (key) => call('store.get', { key }),
            set: (key, value) => call('store.set', { key, value }),
            delete: (key) => call('store.delete', { key }),
            keys: () => call('store.keys', {}),
        }),
        clock: Object.freeze({
            now: () => call('clock.now', {}),
            // Counted as the hook's own time, so the clock is not paused.
            sleep: (ms) => binding.invoke('clock.sleep', { ms }),
            after: (ms, fn) => timers.after(ms, fn),
            every: (ms, fn) => timers.every(ms, fn),
        }),
        fs: Object.freeze({
            read: (path) => call('fs.read', { path, as: 'text' }),
            write: (path, text) => call('fs.write', { path, text }),
            list: (path) => call('fs.list', { path: path ?? '.' }),
            exists: (path) => call('fs.exists', { path }),
            stat: (path) => call('fs.stat', { path, resolve: true }),
        }),
        process: Object.freeze({
            run(argv, init) {
                return call('process.run', { argv, ...init === undefined ? {} : { init } });
            },
        }),
        http: Object.freeze({
            fetch(url, init) {
                return call('http.fetch', { url, ...init === undefined ? {} : { init } });
            },
        }),
        env: Object.freeze({
            get: (name) => call('env.get', { name }),
            set: (name, value) => call('env.set', { name, ...value === undefined ? {} : { value } }),
        }),
    };
    return withUnservedMembers(served, mod.name);
}
/** The method namespaces Claude Code's `$` has; `plugin` holds facts, not methods, and stays as served. */
const METHOD_NAMESPACES = new Set([
    'ui', 'command', 'tool', 'prompt', 'session', 'state', 'store', 'clock', 'fs', 'process', 'http', 'env',
    'model', 'agent', 'config', 'settings', 'mcp', 'audio', 'telemetry', 'turn',
]);
/**
 * Give `$` Claude Code's full namespace set: a served member is itself; any
 * other member of a method namespace is a function whose call rejects with
 * `no implementation for <namespace>.<member>`, so a mod that reaches past
 * this host fails with the gap named, not with a TypeError.
 * @param served - the frozen object of served namespaces.
 * @param modName - the mod the `$` belongs to, for the rejection text.
 * @returns the `$` a hook receives.
 */
function withUnservedMembers(served, modName) {
    const namespaces = new Map();
    const namespaceOf = (name, base) => {
        let wrapped = namespaces.get(name);
        if (wrapped === undefined) {
            wrapped = new Proxy(base, {
                get(target, member, receiver) {
                    const own = Reflect.get(target, member, receiver);
                    if (own !== undefined || typeof member !== 'string' || member === 'then')
                        return own;
                    return () => Promise.reject(new Error(`${modName}: no implementation for ${name}.${member}`));
                },
            });
            namespaces.set(name, wrapped);
        }
        return wrapped;
    };
    return new Proxy(served, {
        get(target, namespace, receiver) {
            const own = Reflect.get(target, namespace, receiver);
            if (typeof namespace !== 'string' || !METHOD_NAMESPACES.has(namespace))
                return own;
            return namespaceOf(namespace, typeof own === 'object' && own !== null ? own : Object.freeze({}));
        },
        // `$` is read-only, as the frozen object was.
        set: () => false,
        defineProperty: () => false,
        deleteProperty: () => false,
    });
}
//# sourceMappingURL=api.js.map