/** Session Controller adapter for React selector hooks and Slot scope data. */
import { Service } from '@deepseek-ai/cordis';
import { notifySubscribers } from '@deepseek-ai/dsh-client-store';
import { WeakMapWithValues } from '@deepseek-ai/dsh-util-values';
import { standardHookPropName } from '@deepseek-ai/dsh-client-ui-slots';
import { renderSessionArea } from "./session-provider.js";
class PendingInteractionDomain {
    precedence;
    changed;
    values = new Map();
    constructor(precedence, changed) {
        this.precedence = precedence;
        this.changed = changed;
    }
    valuesSnapshot() {
        return [...this.values.values()].map(entry => entry.interaction);
    }
    publish(interaction, delegate) {
        if (this.values.has(interaction.key)) {
            throw new Error(`ui-session: duplicate pending interaction key '${interaction.key}'`);
        }
        this.values.set(interaction.key, { interaction, delegate });
        this.changed();
        let active = true;
        return () => {
            if (!active)
                return;
            active = false;
            if (!this.values.delete(interaction.key))
                return;
            this.changed();
        };
    }
    /** Remove every pending value and return the operations that settle their owners. */
    release() {
        const delegates = [...this.values.values()].map(entry => entry.delegate);
        this.values.clear();
        return delegates;
    }
}
const BUILTIN_SOURCE = {
    hooks: ['session'],
    keyedHooks: ['projection'],
    props: ['sessionId'],
    resolve: binding => ({
        hooks: { session: binding.session },
        keyedHooks: { projection: key => binding.session.projections.faceOf(key) },
        props: { sessionId: binding.sessionId },
    }),
};
/** Session-scoped source roster and renderer adapter. */
export class UiSession extends Service {
    sessions;
    descriptors = [
        BUILTIN_SOURCE,
    ];
    bindings = new WeakMapWithValues();
    absent;
    current;
    pendingDomains = [];
    pendingSnapshot = new Map();
    running = new Map();
    completionUnread = new Set();
    statusSnapshot = new Map();
    statusListeners = new Set();
    mainRetainId;
    disposeMainRetain = () => { };
    active = true;
    /** Root source combining running, pending-interaction, and completion-reminder facts. */
    sessionStatus = {
        getSnapshot: () => this.statusSnapshot,
        subscribe: (listener) => {
            this.statusListeners.add(listener);
            return () => { this.statusListeners.delete(listener); };
        },
    };
    /** Renderer-facing adapter for `session` and `session-maybe` scopes. */
    adapter;
    /**
     * @param ctx - Client root context.
     * @param sessions - Controller-owned Session object layer.
     */
    constructor(ctx, sessions) {
        super(ctx, 'uiSession');
        this.sessions = sessions;
        this.absent = createBindingSource(this.materializeAbsent());
        this.current = createBindingSource(this.absent.value);
        this.adapter = {
            current: this.current,
            bindingSource: target => this.bindingSource(target),
            renderArea: renderSessionArea,
        };
        ctx.effect(() => {
            const disposeList = sessions.list.subscribe(() => { this.publishMain(); });
            const disposeStatus = sessions.list.subscribe(() => { this.reconcileStatus(); });
            const disposeRemoteStatus = ctx.remote.$on('api-session/status', (sessionId, running) => {
                this.observeRunning(sessionId, running);
            });
            this.publishMain();
            this.reconcileStatus();
            return () => {
                this.active = false;
                disposeList();
                disposeStatus();
                disposeRemoteStatus();
                this.disposeMainRetain();
                const records = [...this.bindings.values];
                this.bindings.clear();
                for (const record of records)
                    record.release();
            };
        }, 'ui-session: Session binding projection');
    }
    /**
     * Resolve a stable renderer source for an owned Session reference or explicit absence.
     * @param reference - active reference supplied by the Provider owner, or absence.
     * @returns the binding source, which falls back to the absent projection when its generation ends.
     * @throws when the reference does not belong to the active Controller generation.
     */
    bindingSource(reference) {
        if (!this.active)
            return this.absent;
        if (reference === undefined)
            return this.absent;
        const owner = reference.binding;
        if (this.sessions.binding(reference.sessionId) !== owner) {
            throw new Error('ui-session: Session reference is not active in this Controller');
        }
        return this.sourceFor(owner);
    }
    /**
     * Register one Session-scoped standard-source contribution.
     * @param descriptor - static member roster and per-binding resolver.
     * @returns disposer owned by the caller's Cordis fiber.
     */
    provide(descriptor) {
        const runtimeDescriptor = descriptor;
        const dispose = this.ctx.effect(() => {
            this.descriptors.push(runtimeDescriptor);
            try {
                this.rebuildBindings();
            }
            catch (error) {
                this.descriptors.pop();
                throw error;
            }
            return () => {
                const index = this.descriptors.indexOf(runtimeDescriptor);
                this.descriptors.splice(index, 1);
                this.rebuildBindings();
            };
        }, 'uiSession.provide()');
        return () => { void dispose(); };
    }
    /**
     * Register one pending-interaction domain and return its publication function.
     * Domain teardown first removes its visible values, then delegates and awaits
     * every still-active owner request.
     * @param precedence - deterministic cross-domain precedence; larger values win.
     * @returns a function that publishes one interaction and its teardown delegation.
     */
    registerPendingInteraction(precedence) {
        const domain = new PendingInteractionDomain(precedence, () => {
            this.publishPendingInteractions();
        });
        const runtimeDomain = domain;
        this.ctx.effect(() => {
            this.pendingDomains.push(runtimeDomain);
            this.publishPendingInteractions();
            return async () => {
                const delegates = domain.release();
                const index = this.pendingDomains.indexOf(runtimeDomain);
                this.pendingDomains.splice(index, 1);
                this.publishPendingInteractions();
                await Promise.allSettled(delegates.map(delegate => Promise.resolve().then(delegate)));
            };
        }, 'uiSession.registerPendingInteraction()');
        return (interaction, delegate) => domain.publish(interaction, delegate);
    }
    rebuildBindings() {
        const absent = this.materializeAbsent();
        const updates = [...this.bindings.values].map(record => ({
            source: record.source,
            value: this.materialize(record.owner),
        }));
        this.absent.value = absent;
        for (const { source, value } of updates)
            source.value = value;
        notifySubscribers(this.absent.listeners, '[ui-session] absent binding');
        for (const { source } of updates) {
            notifySubscribers(source.listeners, '[ui-session] Session binding');
        }
        this.publishMain();
    }
    sourceFor(owner) {
        const cached = this.bindings.get(owner);
        if (cached !== undefined)
            return cached.source;
        const record = this.createMaterializedBinding(owner);
        this.bindings.set(owner, record);
        return record.source;
    }
    publishMain() {
        if (!this.active)
            return;
        const byId = this.sessions.list.getSnapshot().byId;
        const currentId = this.current.value.key;
        const currentIsMain = currentId !== undefined
            && (this.sessions.retainInfo(currentId).getSnapshot().retainedBy.mainView ?? 0) > 0;
        const nextId = currentIsMain
            ? currentId
            : Object.values(byId).find(candidate => (candidate.retainedBy.mainView ?? 0) > 0)?.id;
        this.watchMainRetention(nextId);
        const owner = nextId === undefined ? undefined : this.sessions.binding(nextId);
        const value = owner === undefined ? this.absent.value : this.sourceFor(owner).value;
        if (this.current.value === value)
            return;
        this.current.value = value;
        notifySubscribers(this.current.listeners, '[ui-session] main binding');
    }
    watchMainRetention(sessionId) {
        if (sessionId === this.mainRetainId)
            return;
        this.disposeMainRetain();
        this.mainRetainId = sessionId;
        this.disposeMainRetain = sessionId === undefined
            ? () => { }
            : this.sessions.retainInfo(sessionId).subscribe(() => { this.publishMain(); });
    }
    publishPendingInteractions() {
        const next = new Map();
        for (const domain of this.pendingDomains) {
            for (const interaction of domain.valuesSnapshot()) {
                const precedence = domain.precedence(interaction);
                const previous = next.get(interaction.sessionId);
                if (previous === undefined || precedence >= previous.precedence) {
                    next.set(interaction.sessionId, { interaction, precedence });
                }
            }
        }
        const projected = new Map([...next].map(([sessionId, value]) => [sessionId, value.interaction]));
        if (samePendingInteractions(this.pendingSnapshot, projected))
            return;
        this.pendingSnapshot = projected;
        this.publishStatus();
    }
    observeRunning(sessionId, running) {
        const previous = this.running.get(sessionId);
        const beforeBaseline = this.sessions.list.getSnapshot().phase === 'pending';
        this.running.set(sessionId, running);
        if (running)
            this.completionUnread.delete(sessionId);
        else if ((previous === true || (previous === undefined && beforeBaseline))
            && !this.isMain(sessionId))
            this.completionUnread.add(sessionId);
        this.publishStatus();
    }
    reconcileStatus() {
        const list = this.sessions.list.getSnapshot();
        const present = new Set(Object.keys(list.byId));
        // Subagent catalog rows and retained subagent fallback rows do not establish Host running state.
        for (const id of list.ids) {
            const row = list.byId[id];
            const previous = this.running.get(id);
            if (previous === undefined)
                this.running.set(id, row.running);
            else if (previous !== row.running)
                this.observeRunning(id, row.running);
        }
        for (const id of present) {
            if (this.isMain(id))
                this.completionUnread.delete(id);
        }
        if (list.phase === 'ready') {
            for (const id of this.running.keys()) {
                if (present.has(id))
                    continue;
                this.running.delete(id);
                this.completionUnread.delete(id);
            }
        }
        this.publishStatus();
    }
    isMain(sessionId) {
        return (this.sessions.list.getSnapshot().byId[sessionId]?.retainedBy.mainView ?? 0) > 0;
    }
    publishStatus() {
        const ids = new Set([
            ...Object.keys(this.sessions.list.getSnapshot().byId),
            ...this.running.keys(),
            ...this.pendingSnapshot.keys(),
            ...this.completionUnread,
        ]);
        const next = new Map();
        for (const id of ids) {
            next.set(id, {
                running: this.running.get(id),
                pendingInteraction: this.pendingSnapshot.get(id),
                completionUnread: this.completionUnread.has(id),
            });
        }
        if (sameSessionStatus(this.statusSnapshot, next))
            return;
        this.statusSnapshot = next;
        notifySubscribers(this.statusListeners, '[ui-session] Session status');
    }
    createMaterializedBinding(owner) {
        const value = this.materialize(owner);
        this.ctx.slots.bindStoreScope(value);
        const source = createBindingSource(value);
        const releaseEffect = owner.ctx.effect(() => () => {
            if (this.bindings.get(owner) === record)
                this.bindings.delete(owner);
            source.value = this.absent.value;
            notifySubscribers(source.listeners, '[ui-session] Session binding');
            this.publishMain();
        }, `ui-session: binding ${owner.sessionId}`);
        const record = {
            owner,
            source,
            release: () => { void releaseEffect(); },
        };
        return record;
    }
    materialize(binding) {
        const hooks = {};
        const keyedHooks = {};
        const props = {};
        const finalProps = new Set();
        for (const descriptor of this.descriptors) {
            const contribution = descriptor.resolve(binding);
            validateContribution(descriptor, contribution);
            copyDeclared('hook', hooks, descriptor.hooks, contribution.hooks, finalProps);
            copyDeclared('keyed hook', keyedHooks, descriptor.keyedHooks, contribution.keyedHooks, finalProps);
            copyDeclared('prop', props, descriptor.props, contribution.props, finalProps);
        }
        const value = {
            key: binding.sessionId,
            ctx: binding.ctx,
            hooks,
            keyedHooks,
            props,
        };
        return value;
    }
    materializeAbsent() {
        const hooks = {};
        const keyedHooks = {};
        const props = {};
        const finalProps = new Set();
        for (const descriptor of this.descriptors) {
            declareAbsent('hook', hooks, descriptor.hooks, finalProps);
            declareAbsent('keyed hook', keyedHooks, descriptor.keyedHooks, finalProps);
            declareAbsent('prop', props, descriptor.props, finalProps);
        }
        return { key: undefined, hooks, keyedHooks, props };
    }
}
function createBindingSource(value) {
    const source = {
        value,
        listeners: new Set(),
        getSnapshot: () => source.value,
        subscribe: (listener) => {
            source.listeners.add(listener);
            return () => { source.listeners.delete(listener); };
        },
    };
    return source;
}
function validateContribution(descriptor, contribution) {
    rejectUndeclared('hook', descriptor.hooks, contribution.hooks);
    rejectUndeclared('keyed hook', descriptor.keyedHooks, contribution.keyedHooks);
    rejectUndeclared('prop', descriptor.props, contribution.props);
}
function rejectUndeclared(kind, declared, values) {
    for (const name of Object.keys(values ?? {})) {
        if (!(declared ?? []).includes(name)) {
            throw new Error(`uiSession.provide: undeclared ${kind} '${name}'`);
        }
    }
}
function copyDeclared(kind, target, declared, values, finalProps) {
    for (const name of declared ?? []) {
        claimStandardProp(kind, name, finalProps);
        const value = values?.[name];
        if (value === undefined)
            throw new Error(`uiSession.provide: missing ${kind} '${name}'`);
        target[name] = value;
    }
}
function declareAbsent(kind, target, declared, finalProps) {
    for (const name of declared ?? []) {
        claimStandardProp(kind, name, finalProps);
        target[name] = undefined;
    }
}
function claimStandardProp(kind, name, finalProps) {
    const propName = kind === 'prop' ? name : standardHookPropName(name);
    if (finalProps.has(propName)) {
        throw new Error(`uiSession.provide: duplicate ${kind} '${name}' at prop '${propName}'`);
    }
    finalProps.add(propName);
}
/** Required Controller and renderer services. */
export const inject = ['sessions', 'slots', 'remote'];
/**
 * Install the Session root source and scoped adapter.
 * @param ctx - Client Cordis context.
 */
export function apply(ctx) {
    const service = new UiSession(ctx, ctx.sessions);
    ctx.slots.provideRoot({
        hooks: {
            sessions: ctx.sessions.list,
            sessionStatus: service.sessionStatus,
        },
        keyedHooks: {
            sessionRetainInfo: key => ctx.sessions.retainInfo(key),
        },
    });
    ctx.slots.installScope('session', service.adapter);
}
function sameSessionStatus(left, right) {
    if (left.size !== right.size)
        return false;
    for (const [id, status] of left) {
        const candidate = right.get(id);
        if (candidate === undefined
            || candidate.running !== status.running
            || candidate.pendingInteraction !== status.pendingInteraction
            || candidate.completionUnread !== status.completionUnread)
            return false;
    }
    return true;
}
function samePendingInteractions(left, right) {
    if (left.size !== right.size)
        return false;
    for (const [sessionId, interaction] of left) {
        if (right.get(sessionId) !== interaction)
            return false;
    }
    return true;
}
//# sourceMappingURL=index.js.map