import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { JsonSchemaNode, ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { NativeBuiltinHostContextV1, HarnessCapabilityCallerV1, HarnessCapabilityTargetV1, HarnessCapabilityArtifactV1, HarnessCapabilityResultV1, HarnessCapabilityJsonV1, HarnessCapabilityInvocationV1 } from '@studybuddy/contracts';
export type CapabilityResult = HarnessCapabilityResultV1;
export type CapabilityJson = HarnessCapabilityJsonV1;
export type CapabilityTarget = HarnessCapabilityTargetV1;
export type CapabilityArtifact = HarnessCapabilityArtifactV1;
export type CapabilityEffect = 'read' | 'write' | 'generation';
export interface CapabilityContext {
    readonly caller: HarnessCapabilityCallerV1;
    readonly agent: Agent;
    readonly signal: AbortSignal;
}
export interface CapabilityToolDescriptor {
    name: string;
    description: string;
    parameters: ToolDefinition['parameters'];
    output: JsonSchemaNode;
    effect: CapabilityEffect;
    revision?: string;
    inputValidation?: 'domain';
}
export interface CapabilityModuleDescription {
    id: string;
    revision: string;
    label: string;
    artifactSchemas: Readonly<Record<string, JsonSchemaNode>>;
}
export type CapabilityBindInput = {
    action: 'create';
    title: string;
} | {
    action: 'attach';
    projectRef: string;
};
export interface CapabilityAdapter {
    readonly id: string;
    readonly revision: string;
    describe(context: CapabilityContext): Promise<CapabilityModuleDescription>;
    listProjects(context: CapabilityContext): Promise<readonly {
        target: CapabilityTarget;
        title: string;
    }[]>;
    bind(context: CapabilityContext, input: CapabilityBindInput): Promise<CapabilityTarget>;
    tools(context: CapabilityContext, target: CapabilityTarget): Promise<readonly CapabilityToolDescriptor[]>;
    execute(context: CapabilityContext, target: CapabilityTarget, tool: string, args: CapabilityJson): Promise<CapabilityResult>;
    status(context: CapabilityContext, operationRef: string, target?: CapabilityTarget): Promise<CapabilityResult>;
    cancel(context: CapabilityContext, operationRef: string, target?: CapabilityTarget): Promise<CapabilityResult>;
    release(context: CapabilityContext, target: CapabilityTarget): Promise<void>;
    presentResult?(result: CapabilityResult): ContentBlock[];
}
export type CapabilityAuthorizer = (context: CapabilityContext, effect: CapabilityEffect, target: CapabilityTarget | null, input: CapabilityJson) => Promise<void>;
export interface CapabilityPluginOptions {
    owner(): NativeBuiltinHostContextV1 | null;
    port: {
        invoke(request: HarnessCapabilityInvocationV1, signal: AbortSignal): Promise<unknown>;
    };
    authorize: CapabilityAuthorizer;
    prepareDelivery?(agent: Agent): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map