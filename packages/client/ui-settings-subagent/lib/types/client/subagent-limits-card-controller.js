/** Staged delegation limits backed by the Host's subagent settings section. */
import { SettingsFormModel, settingsNumberField, } from '@deepseek-ai/dsh-client-ui-primitives';
function limitField(field, minimum) {
    const numeric = settingsNumberField(field);
    return {
        ...numeric,
        parse: (text) => {
            const write = numeric.parse(text);
            if (write?.kind !== 'set')
                return write;
            const value = write.value;
            return Number.isSafeInteger(value) && value >= minimum && !Object.is(value, -0) ? write : undefined;
        },
    };
}
/** Bind two independently resettable limits to one staged settings form. */
export class SubagentLimitsCardController {
    form;
    store;
    /** @param scope - The Host's `subagent` settings section. */
    constructor(scope) {
        this.form = new SettingsFormModel(scope, [limitField('maxDepth', 0), limitField('maxActiveSubagents', 1)]);
        this.store = this.form.bind(() => ({
            ...this.form.shell(),
            maxDepth: this.form.field('maxDepth'),
            maxActiveSubagents: this.form.field('maxActiveSubagents'),
        }));
    }
    /**
     * Bind the limits editor to the slot renderer.
     * @returns The limits snapshot and staged write actions.
     */
    inject() {
        return { hooks: { subagentLimitsCard: this.store }, ...this.form.actions() };
    }
    /** Release accepted-value subscriptions. */
    dispose() { this.form.dispose(); }
}
//# sourceMappingURL=subagent-limits-card-controller.js.map