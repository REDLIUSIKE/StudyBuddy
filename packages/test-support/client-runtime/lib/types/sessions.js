import { createScope, MutableSessionEventSource, scopeOf, SESSION_SEARCH_RESULT_LIMIT, } from '@deepseek-ai/dsh-api-session-controller/client';
import { scopeIdentityOf } from '@deepseek-ai/dsh-api-session-controller/src/client/scope.ts';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { sessionSnapshot } from "./fixtures.js";
/**
 * The fixture-backed session face: lifecycle reads delegate to the fixture's
 * snapshot store; Session verbs are fail-loud stubs unless the
 * fixture supplies them (the runtime never fakes behavior a test did not
 * declare — an unstubbed call names itself instead of half-working). Extra
 * fixture methods are grafted verbatim for feature-side casts.
 */
export class FixtureSession {
    sessionId;
    store;
    /** Mutable event source consumed only by Conversation assembly. */
    eventSource = new MutableSessionEventSource();
    /**
     * Identity-stable per-key faces over fixture-controlled projection values.
     */
    projections;
    /**
     * @param sessionId - host identity (branded view of the fixture id).
     * @param store - Session Controller snapshot store.
     * @param overrides - fixture-declared behavior face, grafted over the stubs.
     */
    constructor(sessionId, store, overrides) {
        this.sessionId = sessionId;
        this.store = store;
        const values = new Map();
        const listeners = new Map();
        const faces = new Map();
        this.projections = {
            faceOf: (key) => {
                let face = faces.get(key);
                if (face === undefined) {
                    face = {
                        getSnapshot: () => values.get(key),
                        subscribe: (fn) => {
                            const set = listeners.get(key) ?? new Set();
                            set.add(fn);
                            listeners.set(key, set);
                            return () => { set.delete(fn); };
                        },
                    };
                    faces.set(key, face);
                }
                return face;
            },
            set: (key, value) => {
                values.set(key, value);
                for (const fn of [...(listeners.get(key) ?? [])])
                    fn();
            },
        };
        Object.assign(this, overrides);
    }
    /** @returns the fixture Session Controller snapshot (useSession read side). */
    getSnapshot() {
        return this.store.getSnapshot();
    }
    /**
     * Subscribe to fixture snapshot changes.
     * @param fn - change callback.
     * @returns unsubscribe.
     */
    subscribe(fn) {
        return this.store.subscribe(fn);
    }
    /**
     * Fail-loud stub; supply `prompt` on the fixture's session face to exercise it.
     * @returns never — always throws.
     */
    prompt() {
        throw new Error(`test session "${this.sessionId}": prompt is not stubbed — supply it on the fixture's session face`);
    }
    /**
     * Minimal local-echo registration: mints an identity without touching the
     * fixture snapshot (submission echoes are client-only presentation state).
     * Supply `beginSubmission` on the fixture's session face to observe echoes.
     * @returns a handle whose abandon is a no-op.
     */
    beginSubmission() {
        this.submissionSeq += 1;
        return {
            requestId: `test-submission-${this.submissionSeq}`,
            abandon: () => { },
        };
    }
    submissionSeq = 0;
    /**
     * Fail-loud stub; supply `readAttachment` on the fixture's session face to exercise it.
     * @param _attachmentId - opaque durable attachment id.
     * @returns never — always throws.
     */
    readAttachment(_attachmentId) {
        throw new Error(`test session "${this.sessionId}": readAttachment is not stubbed — supply it on the fixture's session face`);
    }
    /**
     * Fail-loud stub; supply `updateQueue` on the fixture's session face to exercise it.
     * @returns never — always throws.
     */
    updateQueue() {
        throw new Error(`test session "${this.sessionId}": updateQueue is not stubbed — supply it on the fixture's session face`);
    }
    /**
     * Fail-loud stub; supply `cancel` on the fixture's session face to exercise it.
     * @returns never — always throws.
     */
    cancel() {
        throw new Error(`test session "${this.sessionId}": cancel is not stubbed — supply it on the fixture's session face`);
    }
    /**
     * Fail-loud stub; supply `command` on the fixture's session face to exercise it.
     * @returns never — always throws.
     */
    command() {
        throw new Error(`test session "${this.sessionId}": command is not stubbed — supply it on the fixture's session face`);
    }
    /**
     * Fail-loud stub; supply `loadOlder` on the fixture's session face to exercise it.
     * @returns never — always throws.
     */
    loadOlder() {
        throw new Error(`test session "${this.sessionId}": loadOlder is not stubbed — supply it on the fixture's session face`);
    }
    /**
     * Fail-loud stub; supply `loadThrough` on the fixture's session face to exercise it.
     * @returns never — always throws.
     */
    loadThrough() {
        throw new Error(`test session "${this.sessionId}": loadThrough is not stubbed — supply it on the fixture's session face`);
    }
    /**
     * Fail-loud stub; supply `rename` on the fixture's session face to exercise it.
     * @returns never — always throws.
     */
    rename() {
        throw new Error(`test session "${this.sessionId}": rename is not stubbed — supply it on the fixture's session face`);
    }
}
function freezeRetainedBy(counts) {
    Object.setPrototypeOf(counts, null);
    return Object.freeze(counts);
}
const EMPTY_RETAIN_INFO = Object.freeze({
    referenceCount: 0,
    retainedBy: freezeRetainedBy({}),
});
// TestSessions implements SessionReference against its fixture-owned
// SessionGeneration without importing the production service's private record.
/* jscpd:ignore-start -- The fixture intentionally mirrors production SessionReference settlement and release semantics. */
async function waitForOpen(opening, signal) {
    /* v8 ignore next -- TestSessionReference always supplies its release-composed signal. */
    if (signal === undefined)
        return opening;
    const aborted = Promise.withResolvers();
    const onAbort = () => { aborted.reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
        if (signal.aborted)
            onAbort();
        await Promise.race([opening, aborted.promise]);
    }
    finally {
        signal.removeEventListener('abort', onAbort);
    }
}
class TestSessionReference {
    sessionId;
    generation;
    releaseReference;
    released = new AbortController();
    readiness = Promise.withResolvers();
    ready = this.readiness.promise;
    constructor(sessionId, generation, releaseReference) {
        this.sessionId = sessionId;
        this.generation = generation;
        this.releaseReference = releaseReference;
        void this.ready.catch(() => { });
    }
    get binding() {
        if (this.generation === undefined || !this.generation.live) {
            throw new Error(`Session reference "${this.sessionId}" is released`);
        }
        return this.generation.binding;
    }
    attachOpening(opening, signal) {
        const waitSignal = signal === undefined
            ? this.released.signal
            : AbortSignal.any([this.released.signal, signal]);
        void waitForOpen(opening, waitSignal).then(() => {
            try {
                waitSignal.throwIfAborted();
                this.readiness.resolve(this.binding);
            }
            catch (error) {
                this.readiness.reject(error);
            }
        }, (error) => { this.readiness.reject(error); });
    }
    release() {
        const reason = new Error(`Session reference "${this.sessionId}" is released`);
        const release = this.releaseReference;
        this.released.abort(reason);
        this.readiness.reject(reason);
        this.generation = undefined;
        this.releaseReference = undefined;
        release?.();
    }
    [Symbol.dispose]() {
        this.release();
    }
}
/* jscpd:ignore-end */
/**
 * Sessions test double behind the renderer host and feature injects: owns the
 * catalog observable, scope minting through the production `createScope`,
 * stable Controller bindings, and the session behavior face supplied per
 * fixture. `ui-session` owns standard-source materialization.
 *
 * Implements the same ISessions face features receive as `ctx.sessions`, so
 * a production face change breaks this double at compile time; the extra
 * members (add/updateSessionSnapshot/event-window drivers/remove/
 * behavior/calls/stubs) are bench-only surface.
 */
export class TestSessions {
    stabilize;
    rootCtx;
    /** The useSessions catalog feed, independent of view ownership. */
    list;
    records = new Map();
    generations = new Map();
    addresses = new Map();
    retentionStores = new Map();
    pendingDrops = new Set();
    closed = false;
    /** Calls observed on the service-level face, newest last. */
    calls = [];
    /** The wire schema's `session.search` result bound (production parity). */
    searchResultLimit = SESSION_SEARCH_RESULT_LIMIT;
    /** Replaceable search behavior (see {@link TestSessions.stubSearch}). */
    searchStub;
    createStub;
    /**
     * @param stabilize - the owning runtime's act wrapper.
     * @param rootCtx - the runtime's Cordis root; scope fibers mount under it.
     */
    constructor(stabilize, rootCtx) {
        this.stabilize = stabilize;
        this.rootCtx = rootCtx;
        this.list = createSnapshotStore({
            ids: [], byId: {}, phase: 'ready', projectionsBySession: {},
        });
        rootCtx.effect(() => async () => {
            this.closed = true;
            for (const [id, generation] of this.generations) {
                generation.live = false;
                generation.retention = EMPTY_RETAIN_INFO;
                generation.lifetime.abort(new Error('test Session Controller is disposed'));
                this.publishRetention(id);
            }
            this.generations.clear();
            await this.drainDrops();
        }, 'test sessions: Client generations');
    }
    /**
     * Add a Session fixture to the catalog without retaining a generation.
     * @param fixture - identity + snapshot/summary overrides + behavior face.
     * @returns the stable session id (branded view of `fixture.id`).
     */
    async add(fixture) {
        const id = fixture.id;
        if (this.records.has(id))
            throw new Error(`test session "${id}" already added`);
        const summary = {
            id,
            displayTitle: fixture.id,
            running: false,
            blank: false,
            updatedAt: this.records.size + 1,
            ...fixture.summary,
            retainedBy: this.retentionSnapshot(id).retainedBy,
        };
        const snapshot = createSnapshotStore({
            ...sessionSnapshot(id),
            ...fixture.snapshot,
        });
        const session = new FixtureSession(id, snapshot, fixture.session ?? {});
        if (fixture.events !== undefined || fixture.hasMore === true) {
            session.eventSource.replace(fixture.events ?? [], fixture.hasMore ?? false);
        }
        this.records.set(id, {
            summary,
            snapshot,
            session,
            overrides: fixture.session ?? {},
            projections: new Map(),
            initialOpen: fixture.initialOpen,
        });
        await this.stabilize(() => {
            this.list.update((draft) => {
                draft.ids.push(id);
                draft.byId[id] = summary;
            });
        });
        return id;
    }
    /**
     * Update Session Controller lifecycle state through an immer draft.
     * @param id - session id.
     * @param mutate - draft mutator.
     */
    async updateSessionSnapshot(id, mutate) {
        const record = this.require(id);
        await this.stabilize(() => {
            record.snapshot.update(mutate);
            this.generations.get(id)?.snapshot.set(record.snapshot.getSnapshot());
        });
    }
    /**
     * Publish one complete projection value through the fixture Session face.
     * @param id - session id.
     * @param key - registered projection key.
     * @param value - complete value for that key.
     */
    async setProjection(id, key, value) {
        const record = this.require(id);
        record.projections.set(key, value);
        await this.stabilize(() => {
            record.session.projections.set(key, value);
            this.generations.get(id)?.session.projections.set(key, value);
        });
    }
    /**
     * Replace a Session's complete contiguous event window.
     * @param id - Session identity.
     * @param entries - complete event window.
     * @param hasMore - whether older history remains.
     */
    async replaceEvents(id, entries, hasMore = false) {
        await this.stabilize(() => {
            this.require(id).session.eventSource.replace(entries, hasMore);
            this.generations.get(id)?.session.eventSource.replace(entries, hasMore);
        });
    }
    /**
     * Prepend one older contiguous event page.
     * @param id - Session identity.
     * @param entries - older entries.
     * @param hasMore - whether another older page remains.
     */
    async prependEvents(id, entries, hasMore = false) {
        await this.stabilize(() => {
            this.require(id).session.eventSource.prepend(entries, hasMore);
            this.generations.get(id)?.session.eventSource.prepend(entries, hasMore);
        });
    }
    /**
     * Append one live event to a Session's contiguous window.
     * @param id - Session identity.
     * @param entry - live event entry.
     */
    async appendEvent(id, entry) {
        await this.stabilize(() => {
            this.require(id).session.eventSource.append(entry);
            this.generations.get(id)?.session.eventSource.append(entry);
        });
    }
    /**
     * Update a session's list row (the wire-echo stand-in: title settles,
     * running flips — components subscribed via useSessions re-render).
     * @param id - session id.
     * @param patch - summary fields to merge over the row.
     */
    async updateSummary(id, patch) {
        const record = this.require(id);
        record.summary = {
            ...record.summary,
            ...patch,
            retainedBy: this.retentionSnapshot(id).retainedBy,
        };
        await this.stabilize(() => {
            this.list.update((draft) => { draft.byId[id] = record.summary; });
        });
    }
    /**
     * Remove a catalog row and mark its retained Session removed without releasing owners.
     * @param id - session id.
     */
    async remove(id) {
        this.require(id);
        this.records.delete(id);
        await this.stabilize(() => {
            this.list.update((draft) => {
                draft.ids = draft.ids.filter(existing => existing !== id);
                const { [id]: _dead, ...rest } = draft.byId;
                draft.byId = rest;
            });
            this.generations.get(id)?.snapshot.update((draft) => { draft.removed = true; });
        });
    }
    /**
     * Borrow the already-retained session-scoped Cordis context.
     * @param id - session id.
     * @returns the scoped context, or undefined without a live reference.
     */
    scope(id) {
        return this.generations.get(id)?.binding.ctx;
    }
    /**
     * Session assembly binding (inject factories and provide resolvers receive it).
     * @param id - session id.
     * @returns the live generation's binding, or undefined without a reference.
     */
    binding(id) {
        return this.generations.get(id)?.binding;
    }
    /* jscpd:ignore-start -- The fixture intentionally mirrors production SessionReference acquisition and release semantics. */
    retain(target, options = { source: 'testFixture' }) {
        const { source, signal } = options;
        signal?.throwIfAborted();
        if (this.closed)
            throw new Error('test Session Controller is disposed');
        const id = this.resolveTarget(target);
        const generation = this.generations.get(id) ?? this.materialize(id, this.require(id));
        const reference = this.retainGeneration(id, generation, source);
        try {
            reference.attachOpening(generation.opening, signal);
            return reference;
        }
        catch (error) {
            reference.release();
            throw error;
        }
    }
    async using(target, options, operation) {
        const reference = this.retain(target, options);
        try {
            await reference.ready;
            return await operation(reference);
        }
        finally {
            reference.release();
        }
    }
    /* jscpd:ignore-end */
    retainInfo(id) {
        let store = this.retentionStores.get(id);
        if (store === undefined) {
            store = createSnapshotStore(this.retentionSnapshot(id));
            this.retentionStores.set(id, store);
        }
        return store;
    }
    /**
     * Retain one fixture Session until the supplied Cordis owner stops.
     * @param ownerCtx - context whose disposal releases the reference.
     * @param target - fixture Session identity or subagent address.
     * @param options - reference source and optional readiness cancellation.
     * @returns the owned reference immediately.
     */
    retainFor(ownerCtx, target, options = { source: 'testFixture' }) {
        const reference = this.retain(target, options);
        try {
            ownerCtx.effect(() => () => { reference.release(); }, 'test sessions: owned reference');
            return reference;
        }
        catch (error) {
            reference.release();
            throw error;
        }
    }
    /**
     * Read the session scope tag off a context (service-method boundary mirror).
     * @param ctx - any client context.
     * @returns the session id, or undefined on root contexts.
     */
    scopeOf(ctx) {
        return scopeOf(ctx);
    }
    /**
     * Resolve the scoped session face off a context (production `sessionOf`
     * mirror).
     * @param ctx - any client context.
     * @returns the fixture session face, or undefined off-scope.
     */
    sessionOf(ctx) {
        const id = scopeOf(ctx);
        if (id === undefined)
            return undefined;
        const generation = this.generations.get(id);
        return generation !== undefined
            && scopeIdentityOf(generation.binding.ctx) === scopeIdentityOf(ctx)
            ? generation.session
            : undefined;
    }
    /**
     * Install Session creation behavior for navigation tests.
     * @param impl - implementation that must return an already-added fixture id.
     */
    stubCreate(impl) {
        this.createStub = impl;
    }
    /** Create through the installed test behavior and require a catalogued fixture. */
    async create(opts) {
        this.calls.push({ method: 'create', args: [opts] });
        if (this.createStub === undefined) {
            throw new Error('test sessions: create is not stubbed — call stubCreate() first');
        }
        const id = await this.createStub(opts);
        this.require(id);
        return id;
    }
    /** Resolve a retained or catalog-derived address independently of a view. */
    subagentAddress(id) {
        const retained = this.addresses.get(id);
        if (retained !== undefined)
            return retained;
        for (const [parentSessionId, projections] of Object.entries(this.list.getSnapshot().projectionsBySession)) {
            const child = projections.values.subagentCatalog?.find(entry => entry.id === id);
            if (child !== undefined && child.mode !== 'external') {
                return { parentSessionId: parentSessionId, childSessionId: id, mode: child.mode };
            }
        }
        return undefined;
    }
    /** Record a projection refresh; fixture callers drive snapshots explicitly. */
    refreshProjections(sessionId) {
        this.calls.push({ method: 'refreshProjections', args: [sessionId] });
        return Promise.resolve();
    }
    /** Record a list refresh; fixture callers publish list state explicitly. */
    refresh() {
        this.calls.push({ method: 'refresh', args: [] });
        return Promise.resolve();
    }
    /**
     * Replace the sidebar-search result page (the call is still recorded).
     * @param impl - hits for a query, as the Host would rank them.
     */
    stubSearch(impl) {
        this.searchStub = impl;
    }
    /**
     * Content search over the fixture corpus (recorded). The default answers an
     * empty page: content ranking is Host behavior, so a scenario that asserts
     * hits declares them through {@link TestSessions.stubSearch}.
     * @param query - non-blank literal phrase.
     * @param signal - cancellation for a superseded search (recorded and forwarded).
     * @returns the stubbed or empty result page.
     */
    search(query, signal) {
        this.calls.push({ method: 'search', args: [query, signal] });
        return Promise.resolve({ ok: true, value: this.searchStub?.(query, signal) ?? { items: [], hasMore: false } });
    }
    /**
     * Recorded fork stub: no child materializes (benches asserting the full
     * fork flow drive the production service; this face only proves the call).
     * @param opts - source session id, optional cut anchor, and client title policy.
     * @returns the source id (no child record is created).
     */
    fork(opts) {
        this.calls.push({ method: 'fork', args: [opts] });
        return Promise.resolve(opts.sessionId);
    }
    /**
     * The session face of a fixture (typed view for assertions; fixture
     * behavior methods are grafted onto it).
     * @param id - session id.
     * @returns the FixtureSession carried by the Controller binding.
     */
    behavior(id) {
        return this.generations.get(id)?.session ?? this.require(id).session;
    }
    /** Dispose minted scope fibers (runtime dispose path). */
    async disposeScopes() {
        this.closed = true;
        for (const [id, generation] of this.generations)
            this.drop(id, generation);
        await this.drainDrops();
    }
    resolveTarget(target) {
        const id = typeof target === 'string' ? target : target.childSessionId;
        if (typeof target !== 'string') {
            this.addresses.set(id, target);
        }
        this.require(id);
        return id;
    }
    retainGeneration(id, generation, source) {
        const previous = generation.retention;
        generation.retention = Object.freeze({
            referenceCount: previous.referenceCount + 1,
            retainedBy: freezeRetainedBy({
                ...previous.retainedBy,
                [source]: (previous.retainedBy[source] ?? 0) + 1,
            }),
        });
        const reference = new TestSessionReference(id, generation, () => {
            if (!generation.live)
                return;
            const count = generation.retention.referenceCount - 1;
            const { [source]: sourceCount = 0, ...otherSources } = generation.retention.retainedBy;
            const retainedBy = sourceCount > 1
                ? { ...otherSources, [source]: sourceCount - 1 }
                : otherSources;
            generation.retention = count === 0
                ? EMPTY_RETAIN_INFO
                : Object.freeze({ referenceCount: count, retainedBy: freezeRetainedBy(retainedBy) });
            if (count === 0)
                this.drop(id, generation);
            else
                this.publishRetention(id);
        });
        this.publishRetention(id);
        return reference;
    }
    retentionSnapshot(id) {
        return this.generations.get(id)?.retention ?? EMPTY_RETAIN_INFO;
    }
    publishRetention(id) {
        const retention = this.retentionSnapshot(id);
        const store = this.retentionStores.get(id);
        if (store !== undefined && store.getSnapshot() !== retention)
            store.set(retention);
        const state = this.list.getSnapshot();
        const row = state.byId[id];
        if (row === undefined || row.retainedBy === retention.retainedBy)
            return;
        const summary = { ...row, retainedBy: retention.retainedBy };
        const record = this.records.get(id);
        /* v8 ignore next -- a catalog row and its fixture record are inserted and removed together. */
        if (record !== undefined)
            record.summary = summary;
        this.list.set({ ...state, byId: { ...state.byId, [id]: summary } });
    }
    materialize(id, fixture) {
        const { ctx, fiber } = createScope(this.rootCtx, id);
        const snapshot = createSnapshotStore(fixture.snapshot.getSnapshot());
        const session = new FixtureSession(id, snapshot, fixture.overrides);
        const window = fixture.session.eventSource.getSnapshot();
        session.eventSource.replace(window.entries, window.hasMore);
        for (const [key, value] of fixture.projections)
            session.projections.set(key, value);
        const opening = Promise.withResolvers();
        void opening.promise.catch(() => { });
        const lifetime = new AbortController();
        const generation = {
            binding: { sessionId: id, session, eventSource: session.eventSource, ctx },
            snapshot,
            session,
            fiber,
            lifetime,
            opening: opening.promise,
            retention: EMPTY_RETAIN_INFO,
            live: true,
        };
        this.generations.set(id, generation);
        ctx.effect(() => async () => {
            if (generation.live) {
                generation.live = false;
                generation.retention = EMPTY_RETAIN_INFO;
                if (this.generations.get(id) === generation)
                    this.generations.delete(id);
                this.publishRetention(id);
            }
            lifetime.abort(new Error(`test Session generation "${id}" is disposed`));
            await Promise.allSettled([generation.opening]);
        }, 'test sessions: exact generation');
        this.startOpening(fixture.initialOpen, lifetime.signal, opening);
        return generation;
    }
    startOpening(initialOpen, signal, opening) {
        try {
            Promise.resolve(initialOpen?.(signal)).then(opening.resolve, opening.reject);
        }
        catch (error) {
            opening.reject(error);
        }
    }
    drop(id, generation) {
        /* v8 ignore next -- only the live generation's retained callback can enter drop. */
        if (!generation.live)
            return;
        generation.live = false;
        generation.retention = EMPTY_RETAIN_INFO;
        /* v8 ignore next -- this synchronous path drops only the generation currently stored for id. */
        if (this.generations.get(id) === generation)
            this.generations.delete(id);
        generation.lifetime.abort(new Error(`test Session generation "${id}" is released`));
        this.publishRetention(id);
        const disposal = generation.fiber.dispose();
        this.pendingDrops.add(disposal);
        void disposal.then(() => { this.pendingDrops.delete(disposal); }, (error) => {
            this.pendingDrops.delete(disposal);
            this.rootCtx.logger.warn('test Session scope disposal failed:', error);
        });
    }
    async drainDrops() {
        while (this.pendingDrops.size !== 0)
            await Promise.all([...this.pendingDrops]);
    }
    require(id) {
        const record = this.records.get(id);
        if (record === undefined)
            throw new Error(`test session "${id}" is not added`);
        return record;
    }
}
//# sourceMappingURL=sessions.js.map