import { createRpcCapabilityAdapter } from "./rpc-adapter.js";
import { AIGC_CAPABILITY_REVISION } from '../../../../../../integrations/toonflow/apps/server/src/embedded/capability-contract.mjs';
import { normalizeAigcResult, renderAigcResult } from "../../aigc-tool-adapter.js";
export function createAigcCapabilityAdapter(port, storeImages) {
    const base = createRpcCapabilityAdapter('aigc', AIGC_CAPABILITY_REVISION, port);
    return { ...base, async execute(...args) {
            const result = await base.execute(...args), data = result.data;
            if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.content))
                return { ...result, data: await normalizeAigcResult(data, storeImages) };
            return result;
        }, presentResult: (result) => renderAigcResult(result.data) };
}
//# sourceMappingURL=aigc.js.map