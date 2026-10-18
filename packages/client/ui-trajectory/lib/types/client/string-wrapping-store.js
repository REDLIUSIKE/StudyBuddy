import { createSnapshotStore, } from '@deepseek-ai/dsh-client-store';
/**
 * Create the browser-wide default for expanded JSON strings.
 * @returns A persisted preference sampled only when a string is expanded.
 */
export function createTrajectoryStringWrappingStore() {
    return createSnapshotStore(false, {
        persist: { name: 'dsh.trajectory.jsonStringWrapping' },
    });
}
//# sourceMappingURL=string-wrapping-store.js.map