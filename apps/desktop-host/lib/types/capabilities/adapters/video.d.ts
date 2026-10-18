import { type CapabilityAdapterPort } from './rpc-adapter.ts';
import { normalizeAigcResult } from '../../aigc-tool-adapter.ts';
export declare function createVideoCapabilityAdapter(port: CapabilityAdapterPort, storeImages?: Parameters<typeof normalizeAigcResult>[1]): {
    execute(context: import("../types.ts").CapabilityContext, target: import("@studybuddy/contracts").HarnessCapabilityTargetV1, tool: string, args: import("@studybuddy/contracts").HarnessCapabilityJsonV1): Promise<import("@studybuddy/contracts").HarnessCapabilityResultV1>;
    presentResult: (result: import("../types.ts").CapabilityResult) => import("@deepseek-ai/dsh-llm").ContentBlock[];
    id: string;
    revision: string;
    describe(context: import("../types.ts").CapabilityContext): Promise<import("../types.ts").CapabilityModuleDescription>;
    listProjects(context: import("../types.ts").CapabilityContext): Promise<readonly {
        target: import("../types.ts").CapabilityTarget;
        title: string;
    }[]>;
    bind(context: import("../types.ts").CapabilityContext, input: import("../types.ts").CapabilityBindInput): Promise<import("../types.ts").CapabilityTarget>;
    tools(context: import("../types.ts").CapabilityContext, target: import("../types.ts").CapabilityTarget): Promise<readonly import("../types.ts").CapabilityToolDescriptor[]>;
    status(context: import("../types.ts").CapabilityContext, operationRef: string, target?: import("../types.ts").CapabilityTarget): Promise<import("../types.ts").CapabilityResult>;
    cancel(context: import("../types.ts").CapabilityContext, operationRef: string, target?: import("../types.ts").CapabilityTarget): Promise<import("../types.ts").CapabilityResult>;
    release(context: import("../types.ts").CapabilityContext, target: import("../types.ts").CapabilityTarget): Promise<void>;
};
//# sourceMappingURL=video.d.ts.map