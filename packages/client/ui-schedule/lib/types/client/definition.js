/** This implementation's identity in the tab system: the key its body and title register under. */
export const SCHEDULE_TASK_ID = '@deepseek-ai/dsh-client-ui-schedule/task';
/** The tab kind this package owns. */
export const SCHEDULE_TASK_KIND = 'scheduleTask';
/**
 * The task type's registry definition.
 *
 * The chip text captured here is a constant because an open names only a kind;
 * `ScheduleTaskTabTitle` replaces it with the shown task's stored title.
 * @param t - namespace-bound translate, read fresh on every title call.
 * @returns the definition to register.
 */
export function scheduleTaskDefinition(t) {
    return {
        id: SCHEDULE_TASK_ID,
        kind: SCHEDULE_TASK_KIND,
        priority: 'builtin',
        title: () => t('detail.label'),
    };
}
/**
 * Narrow one tab's navigation parameters to this type's task binding.
 * @param params - the tab record's navigation parameters.
 * @returns the Session and task the tab shows, or undefined for another type's parameters.
 */
export function scheduleTaskParams(params) {
    if (params === undefined || !('sessionId' in params) || !('id' in params))
        return undefined;
    return { sessionId: params.sessionId, id: params.id };
}
//# sourceMappingURL=definition.js.map