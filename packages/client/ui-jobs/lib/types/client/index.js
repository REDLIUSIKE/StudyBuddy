import { JobListAction } from "./JobListAction.js";
import { en, NS, zh } from "./locales.js";
/** Required services: the jobs rosters, observations, and kill, the slot registry, and dictionaries. */
export const inject = ['jobs', 'slots', 'locale'];
/**
 * Client plugin body: register the dictionaries and the header action.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-jobs: dictionaries');
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'job-list',
        // Background work follows the preset label in the header actions band.
        order: 20,
        locale: NS,
        inject: () => ({
            hooks: { jobs: ctx.jobs.state },
            watchRows: sessionId => ctx.jobs.watchRows(sessionId),
            observe: (sessionId, id) => ctx.jobs.observe(sessionId, id),
            // The brand is nominal typing only; the row key is the registry id the
            // roster stream delivered, so the wire boundary stamps it back here.
            killJob: async (sessionId, jobId) => (await ctx.jobs.kill(sessionId, jobId)).ok,
        }),
    }, JobListAction));
}
//# sourceMappingURL=index.js.map