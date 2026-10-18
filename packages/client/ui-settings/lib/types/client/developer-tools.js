/** One accepted preference drives every developer-tool consumer. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/** Shared preference; Host-backed features stay disabled until an accepted value arrives. */
export class DeveloperToolsPreference {
    scope;
    /** Accepted enablement, observable through renderer-bound hooks. */
    enabled;
    local = createSnapshotStore(true);
    /**
     * @param scope - settings-owned namespace controller.
     */
    constructor(scope) {
        this.scope = scope;
        this.enabled = scope.getSnapshot().mode === 'memory' ? this.local : {
            getSnapshot: () => scope.getSnapshot().value?.enabled ?? false,
            subscribe: (listener) => {
                let previous = this.enabled.getSnapshot();
                return scope.subscribe(() => {
                    const next = this.enabled.getSnapshot();
                    if (next === previous)
                        return;
                    previous = next;
                    listener();
                });
            },
        };
    }
    /**
     * Persist a Host choice with ordered writes, or update the shared browser-local choice.
     * @param enabled - requested developer-tool mode.
     * @returns settlement after local publication or Host acceptance; rejects after a refused write recovers.
     */
    async setEnabled(enabled) {
        if (this.scope.getSnapshot().mode === 'memory') {
            this.local.set(enabled);
            return;
        }
        if (!await this.scope.set('enabled', enabled))
            throw new Error('Developer tools preference was not saved');
    }
}
//# sourceMappingURL=developer-tools.js.map