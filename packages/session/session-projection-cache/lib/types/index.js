/**
 * Persisted projection cache (`ctx.sessionProjectionCache`): durable
 * checkpoints of every projection unit's state, one record per session on
 * the `session_projcache` domain (`per-record` layout — the shipped json
 * backend stores one document per session under its root). Reads and writes
 * share ONE coherent state: the domain's in-memory tables serve every read
 * synchronously, and each write lands on the domain's write chain (durability
 * first, then memory), so a read can never observe a disk write the memory
 * has not applied, or a memory value the disk does not hold. The cache is a
 * fold shortcut, never an authority: a row
 * is possibly stale (its `seq` says how stale) but never wrong, so every
 * write path is fail-soft (a lost write costs a longer tail replay on the
 * next cold read) and a `ver` mismatch discards the row instead of migrating
 * it. Design authority: the session-projection RFC
 * (.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md).
 * @module @deepseek-ai/dsh-session-projection-cache
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { snapshotJsonValue } from '@deepseek-ai/dsh-util-values';
import { SessionLogOffset } from '@deepseek-ai/dsh-session';
import { projectionCacheDomainSpec } from "./spec.js";
const PREDECESSOR_TITLE_KEY = 'title';
export { checkpointIdentity, checkpointRecord, checkpointRow, projectionCacheDomainSpec } from "./spec.js";
export const Config = z.object({
    writeEveryEvents: z.natural().min(1).required(),
    writeIntervalMs: z.natural().min(1).required(),
});
/**
 * The persisted projection cache service. Opens the `session_projcache`
 * domain at init, checkpoints live sessions on a throttled write-behind
 * (count/interval triggers from {@link Config}) plus three mandatory points —
 * session creation, `turn/end`, and session disposal (the live-to-cold
 * moment) — and serves the
 * cached rows for a session header. Every durable write is fail-soft:
 * failures log a warning and the cache self-heals on the next write.
 */
export class SessionProjectionCache extends Service {
    config;
    static inject = ['storageDomain', 'sessionProjections', 'sessions'];
    static Config = Config;
    table;
    dirty = new Map();
    constructor(ctx, config) {
        super(ctx, 'sessionProjectionCache');
        this.config = config;
    }
    /** Open the domain and install the write-behind listeners. */
    async [Service.init]() {
        const domain = await this.ctx.storageDomain.open(projectionCacheDomainSpec);
        this.ctx.effect(() => () => domain.close(), 'sessionProjectionCache.domainClose');
        this.table = domain.table('sessions');
        this.installWritePath();
    }
    /**
     * The stored record for one session, accepted only when its bound log
     * identity matches `expected`. A session id names a slot, not a lifecycle:
     * a recreated id or a persistence store swapped under a surviving cache
     * must not let an old record seed state folded from an unrelated log.
     * Synchronous from the domain's in-memory state — the same state every
     * write mutated, so a read can never go around the write chain to the
     * medium.
     * @param id - the session whose record is read.
     * @param expected - the log identity the caller holds (live or stored header).
     * @returns the identity-matching record, or `undefined` (absent or unrelated).
     */
    recordFor(id, expected) {
        const record = this.requireTable().get(id);
        if (record === undefined)
            return undefined;
        return identityMatches(record.identity, expected) ? record : undefined;
    }
    /**
     * The zero-I/O listing read: whole values viewed straight from the stored
     * rows (version-matching keys only) of the record bound to the caller's
     * lifecycle. The header is the only identity witness a listing holds, so
     * this face matches the lifecycle identity (`formatVersion`, `createdAt`,
     * `cwd`, `isSeeded`) and not the inherited cut: within one format
     * generation the cut is fixed at fork time, so it distinguishes no
     * lifecycle the other fields do not, and a viewed value never seeds a fold.
     * The view is as stale as the last durable checkpoint but never wrong and
     * never from an unrelated log. Its `asOfSeq` is the lowest watermark among
     * the served rows: the stored record's own position, which the header
     * cannot relate to the log the caller later opens. The Session list
     * therefore labels the block as cached, and the client lets every value the
     * connected Session produces supersede it whatever this number says.
     * @param meta - the listed session's header (identity witness; no log read).
     * @param keys - optional projection keys required by the caller's audience.
     * @returns the viewed block, or `undefined` when no usable row exists for
     *   this lifecycle at the current Session format.
     */
    cachedSnapshot(meta, keys) {
        const expected = lifecycleIdentityOf(meta);
        const record = this.requireTable().get(meta.id);
        if (record === undefined || !currentLifecycleMatches(record.identity, expected))
            return undefined;
        return this.viewRecord(record, keys);
    }
    /**
     * Read only a predecessor checkpoint's title as a zero-I/O listing hint.
     *
     * The authoritative Session header supplies the lifecycle identity. A cache
     * checkpoint can lag that log but cannot lead it because writes flush the
     * log first, so a matching predecessor title is a genuine (possibly stale)
     * fact from this Session. The registry still requires the current title
     * projection's row version and schema. No other predecessor projection is
     * exposed: format normalization can change their current meaning, and the
     * {@link cachedSnapshot} / hydration paths continue to reject them.
     * @param meta - authoritative listed Session header.
     * @returns a title-only block at the stored title row's watermark, or
     *   `undefined` when the record is current, newer, unrelated, missing, or
     *   incompatible with the title unit.
     */
    cachedPredecessorTitle(meta) {
        const expected = lifecycleIdentityOf(meta);
        const record = this.requireTable().get(meta.id);
        if (record === undefined || !predecessorIdentityMatches(record.identity, expected))
            return undefined;
        return this.viewRecord(record, [PREDECESSOR_TITLE_KEY]);
    }
    /**
     * View selected wire rows as one block bound to the lowest served
     * watermark: the seq every served value has folded through at least. The
     * number is the record's own; whether a consumer may compare it with a
     * live Session's seqs is decided by the face that serves the block, not
     * here.
     */
    viewRecord(record, keys) {
        const values = this.ctx.sessionProjections.viewCheckpoint(record.rows, keys);
        let asOfSeq;
        for (const [key, row] of Object.entries(record.rows)) {
            if (!Object.hasOwn(values, key))
                continue;
            if (asOfSeq === undefined || row.seq < asOfSeq)
                asOfSeq = row.seq;
        }
        return asOfSeq === undefined ? undefined : { asOfSeq, values };
    }
    /**
     * Hydrate projection cells for an already-prepared Session without another
     * persistence read. The cache seeds matching rows; the supplied exact log
     * advances every unit to the observation cut. No checkpoint is written
     * because the logical observation may contain recovery events not yet durable.
     * @param session - exact unpublished Session retained by persistence.
     * @param events - exact logical event prefix represented by the observation.
     * @returns all projection values at the event cut.
     */
    hydratePrepared(session, events) {
        const record = this.recordFor(session.id, identityOf(session.header, session.inheritedEventCount));
        if (record === undefined) {
            return this.ctx.sessionProjections.hydrate(session, {}, events, SessionLogOffset(0));
        }
        try {
            return this.ctx.sessionProjections.hydrate(session, record.rows, events, SessionLogOffset(0));
        }
        catch {
            // Cached rows are disposable derived data. Retry from the exact log so a
            // stale schema cannot make a valid Session unreadable.
            return this.ctx.sessionProjections.hydrate(session, {}, events, SessionLogOffset(0));
        }
    }
    /**
     * Durably checkpoint one live session NOW (all mandatory points call
     * this; tests and carriers may too). The registry cut is snapshotted at
     * this boundary (states are live references), then the session's record is
     * replaced on the domain's write chain. NOT fail-soft — callers on the
     * fail-soft paths contain it.
     * @param session - the live session to checkpoint.
     * @returns resolution after durability and event emission.
     */
    async write(session) {
        const rows = this.ctx.sessionProjections.checkpoint(session);
        this.markClean(session);
        // Durability barrier: the checkpoint cut was taken above, so flushing
        // AFTER it guarantees every event inside the cut is durably logged
        // before the cache row lands — a crash can leave the cache behind the
        // log (longer tail replay) but never ahead of it (phantom values folded
        // from events no stored log contains). At detach the store entry is
        // already gone; persistence's own retirement drain covers that path and
        // any residual overreach is caught by the cold read's anchored floor.
        if (this.ctx.sessions.get(session.id) === session)
            await this.ctx.sessions.flush(session);
        await this.put(session.id, identityOf(session.header, session.inheritedEventCount), rows);
    }
    /**
     * Cold-read one session's projections from its complete log. Each unit is
     * seeded from the identity-checked cached rows — the registry skips `apply`
     * for the already-folded prefix (events at or below the row's `seq`) — and
     * the refreshed checkpoint is written back (fail-soft, fire-and-forget), so
     * the first cold read creates the cache row and later ones seed from it.
     * The caller supplies the complete log in seq order: this service never
     * consults the persistence layer.
     * @param meta - the stored session header (identity witness).
     * @param inheritedEventCount - exact inherited prefix length for projection initialization and identity.
     * @param events - the session's complete log, in seq order.
     * @returns the projection cut at the log end.
     */
    coldSnapshot(meta, inheritedEventCount, events) {
        const identity = identityOf(meta, inheritedEventCount);
        const restored = this.ctx.sessionProjections.restore(this.recordFor(meta.id, identity)?.rows ?? {}, events, SessionLogOffset(0), meta, inheritedEventCount);
        // Refresh the row so the next cold read seeds from it; fail-soft and
        // fire-and-forget — a failed write-back only costs a longer tail replay.
        void this.put(meta.id, identity, restored.checkpoint).catch((error) => {
            this.ctx.logger.warn(`session projection cache: cold-read write-back for "${meta.id}" failed (cache stays stale): ${String(error)}`);
        });
        return restored.snapshot;
    }
    // --- write-behind (throttle + mandatory points) ---
    installWritePath() {
        // Every committed event advances the dirty counter; turn/end is a
        // mandatory point (the durable value most reads want is the turn-final
        // one), count/interval throttle the in-turn stream.
        this.ctx.on('session/event', (session, event) => {
            if (event.type === 'turn/end') {
                void this.flushSoft(session, 'turn/end');
                return;
            }
            const state = this.dirty.get(session) ?? { pending: 0, timer: undefined };
            this.dirty.set(session, state);
            state.pending += 1;
            if (state.pending >= this.config.writeEveryEvents) {
                void this.flushSoft(session, 'count threshold');
                return;
            }
            state.timer ??= setTimeout(() => {
                void this.flushSoft(session, 'interval');
            }, this.config.writeIntervalMs);
        });
        // Creation is the FIRST mandatory point: a session that never talks (a
        // forked child seeded with its ancestor's title, say) would otherwise
        // get its first row only at detach — so a crash, or a fork held live in
        // the store, would leave the seed-derived values (the title) unreadable
        // on the cold list. The creation write captures the seed-derived cut.
        this.ctx.on('session/created', (session) => {
            void this.flushSoft(session, 'create');
        });
        // Detach (the live-to-cold moment): the final mandatory point. After
        // this write the cold-read ladder serves the session from the cache.
        // flushSoft's synchronous prefix reads and resets the dirty state, so
        // dropping it (timer already cleared by markClean) right after is safe.
        this.ctx.on('session/disposed', (session) => {
            void this.flushSoft(session, 'detach');
            this.markClean(session);
            this.dirty.delete(session);
        });
        // With the plugin (their sessions outlive the cache): clear pending
        // timers and stop accepting new work. The domain-close effect registered
        // in init runs after this disposer and drains already-queued writes, so
        // a late flush can never land after disposal (it rejects `closed` into
        // flushSoft's warning instead).
        this.ctx.effect(() => () => {
            for (const state of this.dirty.values()) {
                if (state.timer !== undefined)
                    clearTimeout(state.timer);
            }
            this.dirty.clear();
        }, 'sessionProjectionCache.timers');
    }
    /**
     * One fail-soft durable checkpoint. Every caller has work by construction:
     * the throttle triggers only fire dirty (markClean clears the timer with
     * the counter) and the mandatory points write unconditionally.
     */
    async flushSoft(session, trigger) {
        try {
            await this.write(session);
        }
        catch (error) {
            this.ctx.logger.warn(`session projection cache: ${trigger} write for "${session.id}" failed (cache stays stale): ${String(error)}`);
        }
    }
    /** Reset one session's dirty bookkeeping (its checkpoint is being written). */
    markClean(session) {
        const state = this.dirty.get(session);
        if (state === undefined)
            return;
        state.pending = 0;
        if (state.timer !== undefined) {
            clearTimeout(state.timer);
            state.timer = undefined;
        }
    }
    /** Replace one session's stored record with its log identity and a detached snapshot of `rows`. */
    async put(id, identity, rows) {
        const detached = snapshotJsonValue(rows);
        if (detached === undefined) {
            throw new TypeError('projection checkpoint is not losslessly JSON-serializable (a unit state violates the plain-JSON contract)');
        }
        await this.requireTable().put(id, { identity, rows: detached });
    }
    requireTable() {
        /* v8 ignore next -- Service.init assigns the table before the service becomes injectable */
        if (this.table === undefined)
            throw new Error('session projection cache is not initialized');
        return this.table;
    }
}
/** Project a header onto the identity fields a header alone can witness. */
function lifecycleIdentityOf(header) {
    return {
        formatVersion: header.version,
        createdAt: header.createdAt,
        ...header.cwd === undefined ? {} : { cwd: header.cwd },
        isSeeded: header.isSeeded,
    };
}
/** Project a header and its exact inherited cut onto the complete fold identity. */
function identityOf(header, inheritedEventCount) {
    const cut = SessionLogOffset(inheritedEventCount);
    if (!header.isSeeded && cut !== 0) {
        throw new Error('unseeded projection-cache identity inherited event count must be 0');
    }
    return { ...lifecycleIdentityOf(header), inheritedEventCount: cut };
}
/**
 * Whether a stored record may seed the caller's fold: the current format
 * generation, the same lifecycle, and the same inherited cut. A record folded
 * under another cut encodes that cut in unit states (`schedule`,
 * `subagentCatalog`, `permissions`) and would carry it into the continued
 * fold and the next checkpoint. Absent lineage fields (records admitted via
 * `compatibleVersions` predate them) read as the unseeded lineage: exact for
 * an unseeded caller, while a seeded caller fails the match.
 */
function identityMatches(stored, expected) {
    return currentLifecycleMatches(stored, expected)
        && (stored.inheritedEventCount ?? 0) === expected.inheritedEventCount;
}
/**
 * Whether a stored record was folded from the caller's lifecycle at the
 * current Session format. An absent format generation cannot prove the fold
 * semantics and never matches. This is the whole identity a header-only
 * reader can check, and the whole identity a view needs.
 */
function currentLifecycleMatches(stored, expected) {
    return stored.formatVersion === expected.formatVersion
        && lifecycleIdentityMatches(stored, expected);
}
/** Match one predecessor cache record to the authoritative listed lifecycle. */
function predecessorIdentityMatches(stored, expected) {
    const predecessor = stored.formatVersion === undefined
        || stored.formatVersion < expected.formatVersion;
    return predecessor && lifecycleIdentityMatches(stored, expected);
}
/** Match the format-independent fields that distinguish one Session lifecycle. */
function lifecycleIdentityMatches(stored, expected) {
    return stored.createdAt === expected.createdAt
        && stored.cwd === expected.cwd
        && (stored.isSeeded ?? false) === expected.isSeeded;
}
export default SessionProjectionCache;
//# sourceMappingURL=index.js.map