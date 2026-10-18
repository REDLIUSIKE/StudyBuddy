/** The agent-loop page's staged form over the `agent-loop` settings namespace. */
import { SettingsFormModel, settingsNumberField, } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * Namespace of the agent loop's user-owned settings. Spelled here rather than
 * imported: a client package must not depend on a Host package.
 */
export const AGENT_LOOP_NS = 'agent-loop';
/** Bridges the `agent-loop` scope onto the page's staged form. */
export class AgentLoopCardController {
    form;
    store;
    /** @param scope - the bound settings scope for the `agent-loop` namespace. */
    constructor(scope) {
        this.form = new SettingsFormModel(scope, [settingsNumberField('maxParallelToolCalls')]);
        this.store = this.form.bind(() => this.projection());
    }
    projection() {
        return { ...this.form.shell(), maxParallelToolCalls: this.form.field('maxParallelToolCalls') };
    }
    /**
     * Build the face the page's slot registration injects.
     * @returns the page's snapshot and its form actions.
     */
    inject() {
        return { hooks: { agentLoopCard: this.store }, ...this.form.actions() };
    }
    /** Release accepted-value subscriptions. */
    dispose() { this.form.dispose(); }
}
//# sourceMappingURL=agent-loop-card-controller.js.map