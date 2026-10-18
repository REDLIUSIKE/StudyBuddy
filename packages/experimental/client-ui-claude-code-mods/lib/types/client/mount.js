/** Source-safe browser registration of the mods band: the Remote stream behind a store, the dock entry, the press. */
import { Band } from "./Band.js";
import { en, NS, zh } from "./locales.js";
/** Required browser services: the Remote namespace, slots, and localized copy. */
export const inject = ['remote', 'slots', 'locale'];
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/** A minimal observable the slot renderer turns into `useBand`. */
class BandStore {
    snapshot;
    listeners = new Set();
    getSnapshot() {
        return this.snapshot;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    set(next) {
        this.snapshot = next;
        for (const listener of [...this.listeners])
            listener();
    }
}
/**
 * Keep one session's band store fed from the Host's `watchBand` stream until
 * disposed or until the stream ends; `onEnd` runs then, so the next
 * subscriber opens a fresh stream instead of reading a stale store.
 */
function watchSession(ctx, sessionId, onEnd) {
    const store = new BandStore();
    const controller = new AbortController();
    const handle = ctx.remote.claudeCodeMods.watchBand(sessionId, controller.signal);
    void (async () => {
        try {
            for await (const snapshot of handle)
                store.set(snapshot);
        }
        catch (error) {
            if (!controller.signal.aborted)
                ctx.logger.warn(`claude-code-mods band: watch of ${sessionId} ended: ${messageOf(error)}`);
        }
        finally {
            onEnd();
        }
    })();
    return {
        store,
        dispose: () => {
            controller.abort();
            handle.dispose();
        },
    };
}
function registerUi(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-claude-code-mods: dictionaries');
    const watches = new Map();
    ctx.effect(() => () => {
        for (const watch of watches.values())
            watch.dispose();
        watches.clear();
    }, 'client-ui-claude-code-mods: band watches');
    const watchOf = (sessionId) => {
        let watch = watches.get(sessionId);
        if (watch === undefined) {
            const opened = watchSession(ctx, sessionId, () => {
                if (watches.get(sessionId) === opened)
                    watches.delete(sessionId);
            });
            watch = opened;
            watches.set(sessionId, watch);
        }
        return watch;
    };
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'claude-code-mods',
        order: 20,
        locale: NS,
        inject: (sessionId) => ({
            hooks: { band: watchOf(sessionId).store },
            press: async (generation, actionId) => {
                const result = await ctx.remote.claudeCodeMods.pressBand(sessionId, generation, actionId);
                if (!result.ok)
                    throw result.error;
                watchOf(sessionId).store.set(result.value);
            },
        }),
    }, Band));
}
/**
 * Mount the bridge's Remote contribution and register the band.
 * @param ctx - browser Context with `remote`, `slots`, and `locale`.
 * @param contribution - the generated `claudeCodeMods` Remote contribution.
 * @returns the disposer that withdraws the band and the Remote mount.
 */
export async function mountModsBand(ctx, contribution) {
    const disposeRemote = await ctx.remote.$mount(contribution);
    const ui = ctx.inject(['remote.claudeCodeMods', 'slots', 'locale'], registerUi);
    try {
        await ui;
    }
    catch (error) {
        await ui.dispose();
        await disposeRemote();
        throw error;
    }
    return async () => {
        await ui.dispose();
        await disposeRemote();
    };
}
//# sourceMappingURL=mount.js.map