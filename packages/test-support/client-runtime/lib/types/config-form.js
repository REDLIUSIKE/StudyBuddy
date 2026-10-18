/** Test doubles for settings transport. */
import { vi } from 'vitest';
/**
 * Build an in-memory settings scope for service specs: starts in the host
 * loading state, records writes, and lets the test publish Host acceptances.
 * @returns the stub handle.
 */
export function stubConfigForm() {
    let snapshot = {
        status: 'loading', value: undefined, base: undefined, user: undefined,
        revision: undefined, writable: false, mode: 'host',
    };
    const listeners = new Set();
    const set = vi.fn(() => Promise.resolve(true));
    const mutate = vi.fn(() => Promise.resolve(true));
    const unset = vi.fn(() => Promise.resolve(true));
    return {
        scope: {
            getSnapshot: () => snapshot,
            subscribe: (listener) => {
                listeners.add(listener);
                return () => { listeners.delete(listener); };
            },
            mutate,
            set,
            unset,
        },
        set,
        mutate,
        unset,
        listenerCount: () => listeners.size,
        publish: (next) => {
            snapshot = { ...snapshot, ...next };
            for (const listener of [...listeners])
                listener();
        },
    };
}
//# sourceMappingURL=config-form.js.map