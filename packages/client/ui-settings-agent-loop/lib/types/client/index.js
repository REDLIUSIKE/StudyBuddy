/**
 * The agent loop's settings page, browser half: the parallel tool-call cap
 * over the `agent-loop` namespace the loop registers. The page registers into
 * the Plugins page's `plugins.item` slot while the Host serves that namespace,
 * so a deployment that exposes no agent-loop settings shows no trace of it.
 */
import { AgentLoopCard } from "./AgentLoopCard.js";
import { AGENT_LOOP_NS, AgentLoopCardController } from "./agent-loop-card-controller.js";
import { en, zh } from "./locales.js";
/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.agentLoop';
/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms'];
/**
 * Mount the agent loop's settings page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-agent-loop: dictionaries');
    const card = new AgentLoopCardController(ctx.configForms.get(AGENT_LOOP_NS));
    ctx.effect(() => () => { card.dispose(); }, 'ui-settings-agent-loop: form subscription');
    ctx.effect(() => ctx.configForms.whileServed([AGENT_LOOP_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item', id: 'agent-loop', order: 30, label: () => t('title'), locale: NS, inject: () => card.inject(),
    }, AgentLoopCard))), 'ui-settings-agent-loop: page');
}
//# sourceMappingURL=index.js.map