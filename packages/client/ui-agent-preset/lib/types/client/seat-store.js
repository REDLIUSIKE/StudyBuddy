/**
 * Hero-chip controller: which preset the NEXT session gets.
 *
 * The new-session screen has no session, so a pick is staged rather than
 * applied. It reaches a session when one becomes current and is still blank —
 * whether the workspace connect created it or reused an existing blank one,
 * which is why staging cannot simply ride along on `sessions.create`.
 *
 * The stage is forgotten once applied. The next new session starts from the
 * Host-effective default again.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { presetOptions, readRoster } from "./settings-store.js";
const INITIAL = {
    options: [], current: '', error: null, busy: false, introduce: false,
};
/** Stages the next session's preset and applies it when one appears. */
export class AgentPresetSeatController {
    ctx;
    currentSession;
    staged;
    /** Chip snapshot the renderer subscribes to. */
    store = createSnapshotStore(INITIAL);
    /**
     * The Host-effective default, so a consumed stage can fall back to it without
     * re-reading the roster.
     */
    fallback = '';
    /** Only the newest roster read may publish after overlapping refreshes. */
    loadGeneration = 0;
    /** Completion of the active Host selection; Settings choices wait before staging. */
    pendingSelection;
    constructor(ctx, 
    /** The session the hero is about to hand over to, when there is one. */
    currentSession, staged = { id: undefined, introduce: false }) {
        this.ctx = ctx;
        this.currentSession = currentSession;
        this.staged = staged;
    }
    set(patch) {
        this.store.set({ ...this.store.getSnapshot(), ...patch });
    }
    clearStage() {
        this.staged.id = undefined;
        this.staged.introduce = false;
    }
    /**
     * Read the roster and open the chip on the Host-effective default.
    * @returns once the snapshot reflects the host.
    */
    async load() {
        const generation = ++this.loadGeneration;
        const roster = await readRoster(this.ctx);
        if (generation !== this.loadGeneration)
            return;
        // A roster refresh can finish after a selection; leave its announcement for the chip.
        const error = this.store.getSnapshot().error;
        if (!roster.ok) {
            if (typeof error !== 'object' || error === null)
                this.set({ error: roster.error });
            return;
        }
        const { presets } = roster.value;
        this.fallback = presets.find(preset => preset.isDefault)?.id ?? presets[0]?.id ?? '';
        const session = this.currentSession();
        this.set({
            options: presetOptions(presets),
            // Staged pick first, then the composition the current session
            // already carries, then the Host-effective default. The middle term is
            // what keeps a late-landing load from regressing the display after
            // an applied stage was consumed — the chip mounts (and loads) only
            // once the flow's session is current, so the reply can arrive after
            // apply() already composed it.
            current: this.staged.id ?? (session === undefined ? this.fallback : presetOf(session) ?? ''),
            error: typeof error === 'object' ? error : null,
            introduce: this.staged.introduce,
        });
        await this.apply();
    }
    /**
     * Stage one preset for the next session, applying it immediately when a
     * blank session is already current.
     *
     * The refusal is stored for the chip's announcement and returned to callers
     * such as Settings that also report the result of their own write.
     * @param id - the preset to stage.
     * @returns the refusal text, or undefined once the pick settled.
     */
    async select(id) {
        if (this.store.getSnapshot().busy)
            return undefined;
        this.stage(id);
        return await this.apply();
    }
    /**
     * Stage a pick WITHOUT the immediate apply, for a flow that starts the
     * receiving session after the pick (the settings section's creator entry).
     * `select()`'s immediate apply would meet the still-current running session
     * and drop the stage as unservable; staging alone leaves it for the
     * list-change applier, which fires when the started session becomes
     * current.
     * @param id - the preset to stage.
     * @param introduce - true when the stage came from another screen and the
     * chip should announce itself on the session it lands on.
     */
    stage(id, introduce = false) {
        this.staged.id = id;
        this.staged.introduce = introduce;
        this.set({ current: id, error: null, introduce });
    }
    /** Acknowledge a displayed refusal without dismissing a newer attempt.
     * @param refusal - the selection error whose Toast finished.
     */
    dismissRefusal(refusal) {
        if (refusal !== null && typeof refusal === 'object' && this.store.getSnapshot().error === refusal) {
            this.set({ error: refusal.reason });
        }
    }
    /**
     * Capture the exact blank Session a Settings action may bring along.
     * @returns its id, or undefined outside a blank Session.
     */
    blankSessionId() {
        const session = this.currentSession();
        return session?.blank === true ? session.id : undefined;
    }
    /**
     * Apply a Settings choice only if its captured Session is still current and
     * blank after any pending selection settles. The selection uses the existing stage/apply path.
     * @param expectedSessionId - blank Session captured before the Settings write.
     * @param id - the effective default that the write persisted.
     * @returns the Host refusal text, or undefined when applied or no longer relevant.
     */
    async syncBlankSession(expectedSessionId, id) {
        while (this.pendingSelection !== undefined)
            await this.pendingSelection;
        const session = this.currentSession();
        if (session === undefined || !session.blank || session.id !== expectedSessionId)
            return undefined;
        this.stage(id);
        return await this.apply();
    }
    /** Acknowledge the introduction cue once the chip has played it. */
    introduced() {
        if (!this.store.getSnapshot().introduce)
            return;
        this.staged.introduce = false;
        this.set({ introduce: false });
    }
    /**
     * Hand the staged choice to the current session, if there is one to take it.
     *
     * Called both by `select()` and by whoever observes the current session
     * changing, because the session may appear either before or after the pick.
     * List updates do not repeat a selection while its response is pending.
     * @returns this attempt's Host refusal, or undefined when successful or no switch starts.
     */
    async apply() {
        if (this.store.getSnapshot().busy)
            return;
        const staged = this.staged.id;
        const session = this.currentSession();
        if (staged === undefined) {
            const current = session === undefined ? this.fallback : presetOf(session) ?? '';
            const shown = this.store.getSnapshot();
            if (current !== shown.current)
                this.set({ current });
            return;
        }
        if (session === undefined)
            return;
        // A started session's history was produced under its own composition; the
        // host refuses the swap, so the stage is no longer meaningful.
        if (!session.blank || presetOf(session) === staged) {
            this.clearStage();
            return;
        }
        const completion = Promise.withResolvers();
        this.pendingSelection = completion.promise;
        this.clearStage();
        const refuse = (reason) => {
            this.set({
                error: { reason, preset: this.store.getSnapshot().options.find(option => option.id === staged) ?? { id: staged } },
                current: this.staged.id ?? presetOf(session) ?? '',
            });
            return reason;
        };
        try {
            this.set({ busy: true, error: null });
            const result = await this.ctx.remote.agentPresets.select(session.id, staged);
            if (!result.ok) {
                const { error } = result;
                // Prefer the bare cause; the Toast already names the rejected preset.
                const refusal = 'reason' in error.details && typeof error.details.reason === 'string'
                    ? error.details.reason
                    : error.message;
                return refuse(refusal);
            }
            this.set({ current: this.staged.id ?? result.value });
        }
        catch (error) {
            return refuse(error instanceof Error ? error.message : String(error));
        }
        finally {
            this.pendingSelection = undefined;
            this.set({ busy: false });
            completion.resolve(undefined);
        }
    }
}
function presetOf(session) {
    const value = session?.projectionValues?.agentPreset;
    return typeof value === 'string' ? value : undefined;
}
//# sourceMappingURL=seat-store.js.map