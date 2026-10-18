import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
/** Project stored settings onto the Agent-facing selection type. */
function selection(settings) {
    return {
        provider: settings.provider,
        model: settings.model,
        ...settings.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: ReasoningEffortId(settings.reasoningEffort) },
    };
}
/**
 * Owns the default model selection independently of any Host or transport.
 * Each operation reads the owning Config references.
 */
export class AgentDefaultModelConfig extends Service {
    ownerContext;
    config;
    saves = Promise.resolve();
    explicit = false;
    admission;
    /** Whether session choices and persisted defaults must be separate user actions. */
    get explicitSelection() { return this.explicit; }
    /** Enable the shipped desktop's explicit selection policy without rewriting saved choices.
     * @param admission - Current owned provider and exact model checks; omission denies selection. */
    requireExplicitSelection(admission) { this.explicit = true; this.admission = admission; }
    /** Owned provider admission; an explicit policy without a private consumer stays closed.
     * @param provider - Candidate provider route.
     * @returns Whether the current composition permits that route. */
    providerAllowed(provider) { return !this.explicit || this.admission?.provider(provider) === true; }
    /** Exact owned model admission, separate from advisory generic provider catalogs.
     * @param selection - Candidate provider and exact model identity.
     * @returns Whether the current composition permits that exact selection. */
    selectionAllowed(selection) {
        return !this.explicit ||
            this.admission?.selection(selection) === true;
    }
    static Config = z.object({
        provider: z.string().required().volatile(),
        model: z.string().required().volatile(),
        reasoningEffort: z.string().volatile(),
    });
    constructor(ownerContext, config) {
        super(ownerContext, 'agentDefaultModel');
        this.ownerContext = ownerContext;
        this.config = config;
        ownerContext.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ownerContext.fiber)); });
    }
    /**
     * Read the current default model selection.
     * @returns a detached provider, model, and optional reasoning selection.
     */
    currentSelection() {
        const selected = this.currentDefault();
        if (selected === null)
            throw new Error('MODEL_SELECTION_REQUIRED');
        return selected;
    }
    /** Read a saved choice, leaving an inherited deployment preset unselected under explicit policy.
     * @returns Detached saved selection, or null when the user has not selected a default. */
    currentDefault() {
        const entry = this.ownerContext.fiber.entry, editor = this.ctx.get('configEditor');
        if (this.explicit && entry !== undefined && editor !== undefined) {
            const override = editor.configuration(entry)[0]?.override;
            if (typeof override?.provider !== 'string' || !override.provider.trim() || typeof override.model !== 'string' ||
                !override.model.trim())
                return null;
        }
        const provider = this.config.provider.get(), model = this.config.model.get();
        if (this.explicit && (!provider.trim() || !model.trim()))
            return null;
        const reasoningEffort = this.config.reasoningEffort.get();
        return selection({
            provider, model,
            ...reasoningEffort === undefined ? {} : { reasoningEffort },
        });
    }
    /**
     * Save the complete default model selection. A deployment without a configuration
     * editor keeps its composition entry. Saves commit in submission order; a failed
     * save rejects its caller without blocking later saves.
     * @param next - resolved selection accepted by an entry point.
     * @returns fulfillment after the optional profile write settles.
     */
    async saveSelection(next) {
        const entry = this.ownerContext.fiber.entry;
        if (entry === undefined)
            return;
        const editor = this.ctx.get('configEditor');
        if (editor === undefined)
            return;
        const config = {
            provider: next.provider, model: next.model,
            ...next.reasoningEffort === undefined ? {} : { reasoningEffort: String(next.reasoningEffort) },
        };
        const saved = this.saves.then(() => editor.edit(entry, () => config));
        this.saves = saved.catch(() => { });
        await saved;
    }
}
/** Read nullable policy-aware defaults while retaining older composition services.
 * @param ctx - Context owning the Agent-default service.
 * @returns Saved model selection, or null under an explicit empty-default policy. */
export function currentAgentDefault(ctx) {
    // Agent contexts are live scoped owners, not plugin consumers with a declared
    // property injection. get() resolves the same active scoped service without
    // replacing it with a root service or an invented model.
    const defaults = ctx.get('agentDefaultModel');
    if (defaults === undefined)
        throw new Error('AGENT_DEFAULT_MODEL_UNAVAILABLE');
    return typeof defaults.currentDefault === 'function' ? defaults.currentDefault() : defaults.currentSelection();
}
export default AgentDefaultModelConfig;
//# sourceMappingURL=index.js.map