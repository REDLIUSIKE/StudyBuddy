import { RemoteStreamCarrierError } from '@deepseek-ai/dsh-api-gateway/client';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/**
 * Subscribe once per Client plugin, independent of rendered pages and Sessions.
 * @param ctx - mounted speech Remote owner.
 * @returns shared readiness snapshot and joined observation cleanup.
 */
export function observeReadiness(ctx) {
    const state = createSnapshotStore({ catalog: null, connected: false, error: null });
    let disposed = false;
    const isDisposed = () => disposed;
    const fail = (error) => {
        state.set({ ...state.getSnapshot(), connected: false, error: error instanceof Error ? error.message : String(error) });
    };
    const stream = ctx.remote.$stream({
        name: 'Speech readiness', open: signal => ctx.remote.speech.follow(signal),
        ended: () => new RemoteStreamCarrierError('Speech readiness stream ended'), carrierFailed: fail,
    });
    const observing = (async () => {
        try {
            for await (const item of stream) {
                state.set({ catalog: item.value, connected: true, error: null });
                item.accept();
            }
        }
        catch (error) {
            if (!isDisposed())
                fail(error);
        }
    })();
    return { state, dispose: async () => { disposed = true; await stream.dispose(); await observing; } };
}
//# sourceMappingURL=readiness.js.map