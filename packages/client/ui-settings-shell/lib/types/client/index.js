/**
 * The shell executor's settings page, browser half: the command timeout and
 * the per-stream output cap over the `shell` namespace the executor
 * registers. The page registers into the Plugins page's `plugins.item` slot
 * while the Host serves that namespace, so a deployment without a local shell
 * executor shows no trace of it.
 */
import { ShellCard } from "./ShellCard.js";
import { BASH_NS, PWSH_NS, ShellCardController } from "./shell-card-controller.js";
import { en, zh } from "./locales.js";
/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.shell';
/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms'];
/**
 * Mount the shell settings page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-shell: dictionaries');
    // The base bundle composes exactly one shell executor per platform; the page binds the served one.
    const bash = new ShellCardController(ctx.configForms.get(BASH_NS));
    const pwsh = new ShellCardController(ctx.configForms.get(PWSH_NS));
    ctx.effect(() => () => { bash.dispose(); pwsh.dispose(); }, 'ui-settings-shell: form subscriptions');
    ctx.effect(() => ctx.configForms.whileServed([BASH_NS, PWSH_NS], served => ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item', id: 'shell', order: 40, label: () => t('title'), locale: NS, inject: () => (served.has(PWSH_NS) ? pwsh : bash).inject(),
    }, ShellCard))), 'ui-settings-shell: page');
}
//# sourceMappingURL=index.js.map