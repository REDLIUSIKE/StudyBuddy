import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/** One session's shared directory controller; disposed with the session scope. */
export class ModelDirectory {
    sessions;
    sessionId;
    available;
    catalog;
    projected;
    isBlank;
    track;
    /** The shared snapshot both entries render from (uSES-safe store). */
    store = createSnapshotStore({
        current: null, routable: null, groups: [], failures: [], status: 'idle', pending: null, error: null,
    });
    /** Latest selection operation wins; an older response never overwrites a newer one. */
    generation = 0;
    disposed = false;
    unsubscribeCatalog;
    unsubscribeSelection;
    /**
     * @param sessions - the session wire face (captured from the plugin's root connection).
     * @param sessionId - the owning session.
     * @param available - whether this session may use Agent-bound model RPCs.
     * @param catalog - Host-generation catalog shared by every Session.
     * @param projected - durable model selection projected from Session history.
     * @param isBlank - whether this Session has no first message yet.
     * @param track - desktop-only callback after a successful user selection.
     */
    constructor(sessions, sessionId, available, catalog, projected, isBlank, track) {
        this.sessions = sessions;
        this.sessionId = sessionId;
        this.available = available;
        this.catalog = catalog;
        this.projected = projected;
        this.isBlank = isBlank;
        this.track = track;
        this.unsubscribeCatalog = catalog.store.subscribe(() => { this.syncInputs(); });
        this.unsubscribeSelection = projected.subscribe(() => { this.syncInputs(); });
        this.syncInputs();
    }
    /**
     * Ensure the Host generation's shared available catalog is loaded.
     * @returns the fresh directory value.
     */
    async load() {
        this.assertAvailable();
        await this.catalog.load();
        this.syncInputs();
        return this.store.getSnapshot();
    }
    /**
     * Select the complete provider/model/reasoning selection. The durable
     * projection frame updates the shared current; failures surface on the store
     * and return with the operation so each entry can present its own failure.
     * @param selection - provider, provider-owned model id, and optional adapter-owned effort.
     * @returns the selection outcome, including the original Remote failure.
     */
    async select(selection) {
        this.assertAvailable();
        const previous = this.store.getSnapshot().current;
        const previousEffort = previous?.reasoningEffort ?? (previous === null ? undefined : this.catalog.reasoningFor(previous)?.defaultEffort);
        const nextEffort = selection.reasoningEffort ?? this.catalog.reasoningFor(selection)?.defaultEffort;
        const generation = ++this.generation;
        this.store.update((s) => { s.status = 'selecting'; s.pending = selection; s.error = null; });
        const result = await this.sessions.selectModel({
            sessionId: this.sessionId,
            provider: selection.provider,
            model: selection.model,
            ...selection.reasoningEffort === undefined
                ? {}
                : { reasoningEffort: selection.reasoningEffort },
        });
        if (this.disposed || generation !== this.generation) {
            return result.ok ? { ok: true, value: undefined } : result;
        }
        if (!result.ok) {
            this.store.update((s) => {
                s.status = 'error';
                s.pending = null;
                s.error = `${result.error.code}: ${result.error.message}`;
            });
            return result;
        }
        if (previous !== null) {
            const from = `${previous.provider}/${previous.model}`;
            const to = `${selection.provider}/${selection.model}`;
            if (from !== to)
                this.track?.('model_switch', { ...this.isBlank() ? {} : { session_id: this.sessionId },
                    switch_from: from, switch_to: to });
            if (from === to && previousEffort !== nextEffort)
                this.track?.('thinking_level_switch', {
                    ...this.isBlank() ? {} : { session_id: this.sessionId }, model_name: to, switch_from: previousEffort ?? 'default', switch_to: nextEffort ?? 'default',
                });
        }
        this.store.update((s) => { s.status = 'ready'; s.pending = null; s.error = null; });
        this.syncInputs();
        return { ok: true, value: undefined };
    }
    /** Save one explicit default without changing this Session's durable selection.
     * @param selection - User-selected exact model and optional supported reasoning effort.
     * @returns The save outcome, or undefined when this composition has no explicit-default action. */
    async saveDefault(selection) {
        this.assertAvailable();
        if (!this.store.getSnapshot().explicitDefault || this.sessions.saveDefaultModel === undefined)
            return undefined;
        const generation = ++this.generation;
        this.store.update((state) => { state.status = 'selecting'; state.error = null; });
        const result = await this.sessions.saveDefaultModel(selection);
        if (this.disposed || generation !== this.generation)
            return result.ok ? { ok: true, value: undefined } : result;
        this.store.update((state) => {
            state.status = result.ok ? 'ready' : 'error';
            state.error = result.ok ? null :
                `${result.error.code}: ${result.error.message}`;
        });
        if (!result.ok)
            return result;
        this.catalog.refresh();
        return { ok: true, value: undefined };
    }
    /**
     * Invalidate an in-flight selection response from the previous Host generation.
     */
    resetConnected() {
        if (this.disposed)
            return;
        ++this.generation;
        this.store.update((state) => {
            if (state.status === 'selecting')
                state.status = 'idle';
            state.pending = null;
            state.error = null;
        });
        this.syncInputs();
    }
    /** Scope teardown: late settlements lose write access to the store. */
    dispose() {
        this.disposed = true;
        this.unsubscribeSelection();
        this.unsubscribeCatalog();
    }
    assertAvailable() {
        if (!this.available()) {
            throw new Error('model selection is unavailable for addressed subagent sessions');
        }
    }
    syncInputs() {
        if (this.disposed)
            return;
        const catalog = this.catalog.store.getSnapshot();
        const projected = modelSelectionProjection(this.projected.getSnapshot());
        const intended = projected?.next ?? catalog.value?.default;
        const reasoning = intended === undefined || intended === null ? undefined : this.catalog.reasoningFor(intended);
        const effort = intended?.reasoningEffort ?? reasoning?.defaultEffort;
        const retainedEffort = effort === undefined ? undefined
            : reasoning?.efforts.find(level => level.id === effort)?.name ?? effort;
        if (catalog.status !== 'ready' || catalog.value === null || projected === undefined) {
            this.store.set({
                current: catalog.value === null ? null : this.store.getSnapshot().current,
                ...retainedEffort === undefined ? {} : { retainedEffort },
                routable: null,
                groups: catalog.value?.groups ?? [],
                failures: catalog.value?.failures ?? [],
                status: catalog.status === 'error' ? 'error' : 'loading',
                pending: this.store.getSnapshot().pending,
                error: catalog.error,
            });
            return;
        }
        const selection = projected.next ?? catalog.value.default;
        const routable = selection !== null && catalog.value.groups.some(group => group.id === selection.provider
            && group.models.some(model => model.id === selection.model));
        this.store.set({
            current: selection,
            ...catalog.value.selectionPolicy === 'explicit_default' ? { explicitDefault: true, savedDefault: catalog.value.default } : {},
            ...retainedEffort === undefined ? {} : { retainedEffort },
            routable,
            groups: catalog.value.groups,
            failures: catalog.value.failures,
            status: this.store.getSnapshot().status === 'selecting'
                ? 'selecting'
                : 'ready',
            pending: this.store.getSnapshot().pending,
            error: null,
        });
    }
}
function modelSelectionProjection(value) {
    return value === undefined ? undefined : value;
}
//# sourceMappingURL=directory.js.map