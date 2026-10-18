/**
 * Resolve the task one task tab shows.
 *
 * The Sidebar persists a tab's layout record but not the navigation parameters
 * its opener passed, so a restored tab falls back to the binding this page kind
 * last wrote for that layout id. The tab's body and its chip resolve the shown
 * task the same way; the body additionally needs to know whether the current
 * layout still carries parameters, because only a navigated tab reports a
 * missing task.
 * @module
 */
import { useEffect, useMemo } from 'react';
import { scheduleTaskParams } from "./definition.js";
/**
 * Resolve the task one task tab shows from its navigation or its stored binding.
 * @param sessionId - the Session holding the tab.
 * @param tab - the tab's layout fields and its last navigation.
 * @param taskBindings - provider-owned binding store for restored task tabs.
 * @returns the navigation, the recovered binding, and the task to show.
 */
export function useTaskTabTarget(sessionId, tab, taskBindings) {
    const navigation = scheduleTaskParams(tab.navigation.params);
    const navigated = tab.navigation.params !== undefined;
    const recovered = useMemo(() => navigated ? undefined : taskBindings.read(sessionId, { id: tab.id, kind: tab.kind, contentId: tab.contentId }), [taskBindings, sessionId, tab.id, tab.kind, tab.contentId, navigated, tab.navigation.revision]);
    // A read is pure, so the drop of an entry that records another kind or
    // contentId happens here, after the render that read it committed.
    useEffect(() => {
        if (!navigated)
            taskBindings.dropMismatched(sessionId, { id: tab.id, kind: tab.kind, contentId: tab.contentId });
    }, [taskBindings, sessionId, tab.id, tab.kind, tab.contentId, navigated, tab.navigation.revision]);
    return { navigated, navigation, recovered, params: navigation ?? recovered };
}
//# sourceMappingURL=task-tab-target.js.map