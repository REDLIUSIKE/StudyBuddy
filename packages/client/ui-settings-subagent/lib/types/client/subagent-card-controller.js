/** Shared presentation and actions for the two Host-owned Subagent settings sections. */
/**
 * Derive the shared card state without duplicating either form's subscriptions.
 * @param limits - Current delegation-limit form.
 * @param models - Current model-authorization form.
 * @returns Availability and settlement across the sections this Host serves.
 */
export function subagentCardShell(limits, models) {
    const sections = [limits, models].filter(section => section.available);
    return {
        available: sections.length > 0,
        writable: sections.every(section => section.writable),
        dirty: sections.some(section => section.dirty),
        invalid: sections.some(section => section.invalid)
            || (models.available && models.dirty && models.conflicted),
        saving: sections.some(section => section.saving),
        failed: sections.some(section => section.failed),
    };
}
/**
 * Compose one card from the existing forms; each write retains its namespace revision fence.
 * @param limits - Limit form source and actions.
 * @param models - Model form source and actions.
 * @returns Framework-bound sources and shared save/discard actions.
 */
export function subagentCardFace(limits, models) {
    return {
        hooks: { ...limits.hooks, ...models.hooks },
        editLimit: limits.edit,
        resetLimit: limits.resetField,
        toggleEnabled: models.toggleEnabled,
        toggleModel: models.toggleModel,
        retryCatalog: models.retryCatalog,
        save: () => {
            const limitState = limits.hooks.subagentLimitsCard.getSnapshot();
            const modelState = models.hooks.subagentModelSelectionCard.getSnapshot();
            const state = subagentCardShell(limitState, modelState);
            if (!state.available || !state.writable || !state.dirty || state.invalid || state.saving)
                return;
            if (modelState.available && modelState.dirty)
                models.save();
            if (limitState.available && limitState.dirty)
                limits.save();
        },
        discard: () => {
            if (subagentCardShell(limits.hooks.subagentLimitsCard.getSnapshot(), models.hooks.subagentModelSelectionCard.getSnapshot()).saving)
                return;
            limits.discard();
            models.discard();
        },
    };
}
//# sourceMappingURL=subagent-card-controller.js.map