/** One accepted preference drives every developer-tool consumer. */
import { type ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { DeveloperToolsSettings } from '../developer-tools-settings.ts';
import type { ConfigForm } from './config-form-types.ts';
/** Shared preference; Host-backed features stay disabled until an accepted value arrives. */
export declare class DeveloperToolsPreference {
    private readonly scope;
    /** Accepted enablement, observable through renderer-bound hooks. */
    readonly enabled: ObservableSnapshot<boolean>;
    private readonly local;
    /**
     * @param scope - settings-owned namespace controller.
     */
    constructor(scope: ConfigForm<DeveloperToolsSettings>);
    /**
     * Persist a Host choice with ordered writes, or update the shared browser-local choice.
     * @param enabled - requested developer-tool mode.
     * @returns settlement after local publication or Host acceptance; rejects after a refused write recovers.
     */
    setEnabled(enabled: boolean): Promise<void>;
}
//# sourceMappingURL=developer-tools.d.ts.map