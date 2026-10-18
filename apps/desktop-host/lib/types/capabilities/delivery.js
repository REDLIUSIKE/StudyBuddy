/** Load the original native tool only in the invoking Agent's existing scope. */
export function createCapabilityNativeDelivery(ctx, load) {
    const pending = new Map(), fibers = new Set();
    let closed = false;
    return { async prepare(agent) {
            if (closed)
                throw Error('CAPABILITY_SCOPE_REVOKED');
            if (ctx.tools.get('present', agent))
                return;
            const old = pending.get(agent);
            if (old)
                return old;
            const work = (async () => {
                const value = await load();
                if (closed)
                    throw Error('CAPABILITY_SCOPE_REVOKED');
                if (!value || typeof value !== 'object' || !('name' in value) || value.name !== 'tool-present' || !('apply' in value) || typeof value.apply !== 'function' || !('inject' in value) || !Array.isArray(value.inject))
                    throw Error('CAPABILITY_NATIVE_DELIVERY_UNAVAILABLE');
                const fiber = await agent.ctx.plugin(value, { maxFiles: 4 });
                if (closed) {
                    await fiber.dispose();
                    throw Error('CAPABILITY_SCOPE_REVOKED');
                }
                fibers.add(fiber);
                agent.ctx.effect(() => () => { pending.delete(agent); fibers.delete(fiber); }, 'capabilities.native-delivery');
            })();
            pending.set(agent, work);
            try {
                await work;
            }
            catch (error) {
                if (pending.get(agent) === work)
                    pending.delete(agent);
                throw error;
            }
        }, async close() { closed = true; await Promise.allSettled([...pending.values()]); pending.clear(); const owned = [...fibers]; fibers.clear(); await Promise.all(owned.map(fiber => fiber.dispose())); } };
}
//# sourceMappingURL=delivery.js.map