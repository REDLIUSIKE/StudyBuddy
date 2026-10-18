import type { Volatile } from '@deepseek-ai/cordis';
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ModelSelection } from '@deepseek-ai/dsh-agent';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Default model selection for Agents created without an explicit model. */
        agentDefaultModel: AgentDefaultModelConfig;
    }
}
/** Default model selection supplied by plugin configuration. */
export interface Config {
    /** Registered provider route. */
    provider: Volatile<string>;
    /** Provider-owned model id. */
    model: Volatile<string>;
    /** Adapter-owned reasoning effort; omission follows the provider default. */
    reasoningEffort: Volatile<string | undefined>;
}
/**
 * Owns the default model selection independently of any Host or transport.
 * Each operation reads the owning Config references.
 */
export declare class AgentDefaultModelConfig extends Service {
    private readonly ownerContext;
    private config;
    private saves;
    private explicit;
    private admission;
    /** Whether session choices and persisted defaults must be separate user actions. */
    get explicitSelection(): boolean;
    /** Enable the shipped desktop's explicit selection policy without rewriting saved choices.
     * @param admission - Current owned provider and exact model checks; omission denies selection. */
    requireExplicitSelection(admission?: {
        provider: (provider: string) => boolean;
        selection: (selection: Pick<ModelSelection, 'provider' | 'model'>) => boolean;
    }): void;
    /** Owned provider admission; an explicit policy without a private consumer stays closed.
     * @param provider - Candidate provider route.
     * @returns Whether the current composition permits that route. */
    providerAllowed(provider: string): boolean;
    /** Exact owned model admission, separate from advisory generic provider catalogs.
     * @param selection - Candidate provider and exact model identity.
     * @returns Whether the current composition permits that exact selection. */
    selectionAllowed(selection: Pick<ModelSelection, 'provider' | 'model'>): boolean;
    static Config: z<Schemastery.ObjectS<NoInfer<{
        provider: z<string, string, "volatile-defined">;
        model: z<string, string, "volatile-defined">;
        reasoningEffort: z<string, string, "volatile">;
    }>>, Schemastery.ObjectT<NoInfer<{
        provider: z<string, string, "volatile-defined">;
        model: z<string, string, "volatile-defined">;
        reasoningEffort: z<string, string, "volatile">;
    }>>, "plain">;
    constructor(ownerContext: Context, config: Config);
    /**
     * Read the current default model selection.
     * @returns a detached provider, model, and optional reasoning selection.
     */
    currentSelection(): ModelSelection;
    /** Read a saved choice, leaving an inherited deployment preset unselected under explicit policy.
     * @returns Detached saved selection, or null when the user has not selected a default. */
    currentDefault(): ModelSelection | null;
    /**
     * Save the complete default model selection. A deployment without a configuration
     * editor keeps its composition entry. Saves commit in submission order; a failed
     * save rejects its caller without blocking later saves.
     * @param next - resolved selection accepted by an entry point.
     * @returns fulfillment after the optional profile write settles.
     */
    saveSelection(next: ModelSelection): Promise<void>;
}
/** Read nullable policy-aware defaults while retaining older composition services.
 * @param ctx - Context owning the Agent-default service.
 * @returns Saved model selection, or null under an explicit empty-default policy. */
export declare function currentAgentDefault(ctx: Context): ModelSelection | null;
export default AgentDefaultModelConfig;
//# sourceMappingURL=index.d.ts.map