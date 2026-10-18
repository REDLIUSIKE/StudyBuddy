/**
 * Model-facing delegation through one configured `ctx.subagents` provider.
 * Provider lifecycle controls tool registration and context-sensitive schema
 * wording. Every delegation starts a managed activation and returns its child
 * id; the subagent runtime owns result delivery and resource cleanup.
 * @module @deepseek-ai/dsh-tool-subagent
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { AgentOptions } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';
export declare const name = "tool-subagent";
export declare const inject: string[];
/** Config: which registered provider this tool delegates to, plus child defaults. */
export interface Config {
    /** The `ctx.subagents` provider name to start runs on (e.g. `spawn`, `acp`). */
    provider: string;
    /**
     * Model-facing tool name (default `subagent`). Each loaded instance must use
     * a distinct name.
     */
    toolName?: string;
    /**
     * Sample the Host `subagent-model-selection` setting for each new top-level
     * Session and inherit that decision in its child Sessions.
     */
    modelSelectionSettings?: boolean;
    /**
     * Agent options applied to every child; omitted fields use child-loop defaults.
     */
    agentOptions?: AgentOptions;
    /**
     * Per-child persona that shadows `deployment:persona-prefix`. Requires the
     * provider's `persona` capability; omission preserves the deployment persona.
     */
    persona?: string;
    /**
     * Tool filter applied to every child. Filtered tools disappear from its
     * prompt and reject execution. Requires the provider's `toolFilter`
     * capability; unknown names fail startup.
     */
    toolFilter?: {
        /** Global tool names the child keeps; everything else is removed. */
        allow?: string[];
        /** Global tool names removed from the child. */
        deny?: string[];
    };
    /**
     * Maximum child depth: a non-negative safe integer (`0` forbids delegation),
     * or `'provider-managed'` to send no cap. A numeric cap
     * requires the provider's `depthLimit` capability (mount fails loud
     * otherwise). The provider checks the calling agent's current depth at every
     * start; the tool remains model-visible so runtime policy owns rejection.
     * `'provider-managed'` is for an out-of-process provider whose recursion
     * budget belongs to the child runtime or its own deployment. Omission reads
     * the current Host subagent depth setting (default `1`) at each delegation.
     */
    maxDepth?: number | 'provider-managed';
}
export declare const Config: z<Config>;
/**
 * Install one delegation-tool composition.
 * @param ctx - Context that owns the registrations.
 * @param config - delegation-tool configuration.
 * @param session - unpublished Session supplied by a direct Agent setup; omit for a standing composition.
 */
export declare function apply(ctx: Context, config: Config, session?: Session): void;
//# sourceMappingURL=index.d.ts.map