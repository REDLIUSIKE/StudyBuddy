import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { AllowedModelRouteSchema, assertAllowedModelRoutes, } from "./model-selection.js";
/** Singleton settings owner read when delegation tools are composed for a Session. */
export class SubagentModelSelectionConfig extends Service {
    config;
    static Config = z.object({
        enabled: z.boolean().default(false).volatile(),
        allowedModels: z.array(AllowedModelRouteSchema).default([]).volatile(),
    });
    constructor(ctx, config) {
        super(ctx, 'subagentModelSelection');
        this.config = config;
    }
    /**
     * Read a detached selection preference for the next eligible Session composition.
     * @returns the enabled state and exact allowed routes.
     */
    current() {
        const enabled = this.config.enabled.get();
        const allowedModels = this.config.allowedModels.get();
        assertAllowedModelRoutes(allowedModels);
        if (enabled && allowedModels.length === 0) {
            throw new Error('enabled subagent model selection requires at least one allowed model');
        }
        return { enabled, allowedModels: allowedModels.map(route => ({ ...route })) };
    }
}
export const name = 'subagent-model-selection-settings';
export default SubagentModelSelectionConfig;
//# sourceMappingURL=model-selection-settings.js.map