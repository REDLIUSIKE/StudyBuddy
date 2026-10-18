import { ResourceRegistry } from "./resources.js";
/** Required browser services. */
export const inject = ['slots'];
/**
 * Client plugin body: provide `ctx.resources` and contribute the `resource`
 * root keyed hook that reaches every slot component as `useResource`.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    // Built at apply's top level, never inside an effect: other plugins call
    // `register()` from their own apply, and it adds an effect to this fiber.
    const resources = new ResourceRegistry(ctx);
    const disposeService = ctx.reflect.provide('resources', resources);
    // Registered first, so it tears down last: the face outlives every provider
    // that registered into it.
    ctx.effect(() => () => { void disposeService(); }, 'client-resources: service face');
    ctx.slots.provideRoot({
        keyedHooks: { resource: address => resources.source(address) },
    });
}
//# sourceMappingURL=index.js.map