/**
 * `defineMod`: wrap a Claude Code mod's `register(on, options)` as a DSH
 * plugin. Mounting the plugin registers the mod with the bridge service
 * (`ctx.claudeCodeMods`); unmounting it removes the mod's hooks, timers, and
 * registrations. Mods load in composition order, which is their chain order.
 * @module
 */
import z from '@deepseek-ai/schemastery';
const optionValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
/**
 * Wrap one mod as a DSH plugin.
 * @param spec - the mod's identity, `userConfig` defaults, and `register`.
 * @returns a plugin object for `cordis.yml` or `ctx.plugin`; its `config` overlays `userConfig` as `register`'s `options`.
 */
export function defineMod(spec) {
    const userConfig = Object.freeze({ ...spec.userConfig });
    const definition = Object.freeze({
        name: spec.name,
        ...spec.version === undefined ? {} : { version: spec.version },
        ...spec.root === undefined ? {} : { root: spec.root },
        options: userConfig,
        register: spec.register,
    });
    return {
        name: `claude-code-mod-${spec.name}`,
        inject: ['claudeCodeMods'],
        Config: z.dict(optionValue).default({}),
        definition,
        // A `register` that throws fails this plugin's mount, as any misconfigured plugin does; the rest of the composition continues.
        // The disposer is the return value, which Cordis collects even when the plugin was removed while `register` ran.
        apply(ctx, config) {
            return ctx.claudeCodeMods.add({ ...definition, options: Object.freeze({ ...userConfig, ...config }) });
        },
    };
}
//# sourceMappingURL=define-mod.js.map