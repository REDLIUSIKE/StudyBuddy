import { createRpcCapabilityAdapter } from "./rpc-adapter.js";
import { VIDEO_CAPABILITY_REVISION } from "../../video-tool-descriptors.js";
import { normalizeAigcResult, renderAigcResult } from "../../aigc-tool-adapter.js";
export function createVideoCapabilityAdapter(port, storeImages) {
    const base = createRpcCapabilityAdapter('video', VIDEO_CAPABILITY_REVISION, port);
    return { ...base, async execute(...args) { const result = await base.execute(...args), data = result.data; return data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.content) ? { ...result, data: await normalizeAigcResult(data, storeImages) } : result; }, presentResult: (result) => renderAigcResult(result.data) };
}
//# sourceMappingURL=video.js.map