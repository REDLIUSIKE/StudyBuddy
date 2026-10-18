/**
 * Event routing for the local registry: subscriptions file by filter, and
 * every commit dispatches once to each matching listener with containment.
 * @module @deepseek-ai/dsh-jobs-local/events
 */
import { AnonymousEntries, scopeOf } from '@deepseek-ai/dsh-scope';
/**
 * One scope's contributions: the job controllers attached from it and the
 * `{ owners: 'scope' }` subscriptions registered there. Both tables are
 * anonymous because a contribution is identified by its own disposer, never
 * by a name a second registrant could shadow.
 */
export class JobLayer {
    /** Tokens of the job controllers attached from this scope. */
    controllers = new AnonymousEntries();
    /** The `{ owners: 'scope' }` subscriptions registered from this scope. */
    scoped = new AnonymousEntries();
    isEmpty() {
        return this.controllers.isEmpty() && this.scoped.isEmpty();
    }
}
/**
 * Routes events to subscriptions. `{ owner }` and `{ owners: 'all' }`
 * subscriptions are evaluated against every event regardless of where they
 * were registered; `{ owners: 'scope' }` subscriptions file into the
 * registering context's scope layer and receive the owners composed under it
 * — the global layer, reached from an unscoped context, receives every owner.
 */
export class JobEventHub {
    layers;
    warn;
    unscoped = new Set();
    /**
     * @param layers - the scope-layer table shared with the controller handshake.
     * @param warn - sink for a listener's contained failure.
     */
    constructor(layers, warn) {
        this.layers = layers;
        this.warn = warn;
    }
    /**
     * Register one listener as an effect of `ctx`.
     * @param ctx - the subscribing context; owns the effect and, for `'scope'`, names the scope.
     * @param filter - which owners' events to deliver.
     * @param listener - receives each matching event.
     * @returns disposer that unregisters the listener.
     */
    subscribe(ctx, filter, listener) {
        const subscription = { filter, listener };
        if ('owners' in filter && filter.owners === 'scope') {
            return this.layers.effect(ctx, layer => layer.scoped.append(subscription), { label: 'jobs.events.subscribe()' });
        }
        const dispose = ctx.effect(() => {
            this.unscoped.add(subscription);
            return () => { this.unscoped.delete(subscription); };
        }, 'jobs.events.subscribe()');
        // oxlint-disable-next-line typescript/no-misused-promises -- exact synchronous disposer preserves Cordis effect identity
        return dispose;
    }
    /**
     * Deliver one event to every matching subscription, containing each
     * listener so an observer cannot break the commit already made.
     * @param event - the event to deliver.
     * @param owner - the job's exact owner, or undefined for unowned work.
     */
    emit(event, owner) {
        const ownerId = owner?.id;
        for (const subscription of this.unscoped) {
            const { filter } = subscription;
            if ('owner' in filter && ownerId !== undefined && ownerId !== filter.owner)
                continue;
            this.deliver(subscription, event);
        }
        for (const subscription of this.layers.global.scoped.values())
            this.deliver(subscription, event);
        const scope = owner === undefined ? undefined : scopeOf(owner.ctx);
        for (const layer of this.layers.chainLayers(scope)) {
            for (const subscription of layer.scoped.values())
                this.deliver(subscription, event);
        }
    }
    deliver(subscription, event) {
        try {
            subscription.listener(event);
        }
        catch (error) {
            this.warn(`jobs: event listener threw on ${event.type}: ${String(error)}`);
        }
    }
}
//# sourceMappingURL=events.js.map