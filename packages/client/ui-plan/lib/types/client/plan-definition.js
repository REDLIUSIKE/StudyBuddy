import { submittedPlan } from "./plan.js";
/** One card per invocation; a later PTC settlement retains the original card position. */
export const planDefinition = {
    kind: 'submitted-plan',
    target: 'chat',
    match: (event) => {
        const plan = submittedPlan(event);
        return plan === undefined ? null : { id: plan.callId, role: event.type === 'tool/ptc-dispatch' ? 'update' : 'start' };
    },
    start: (_context, match) => submittedPlan(match.event),
    update: context => context.state,
    buildViewNode: (context) => {
        const start = context.start ?? context.matches[0];
        const data = context.state ?? (start === undefined ? undefined : submittedPlan(start.event));
        if (data === undefined || start === undefined)
            return null;
        return {
            key: context.key, kind: 'submitted-plan', id: context.id, target: 'chat',
            anchorSeq: start.event.seq, location: start.location,
            visibility: 'hidden', data,
        };
    },
};
//# sourceMappingURL=plan-definition.js.map