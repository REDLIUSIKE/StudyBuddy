/**
 * @param expiresAt - server expiration timestamp.
 * @param at - milliseconds since epoch.
 * @returns whether the bonus can no longer be shown.
 */
function expired(expiresAt, at) {
    const expires = Date.parse(expiresAt);
    // An unparsable timestamp is not evidence of expiry, so the notice still shows.
    return !Number.isNaN(expires) && expires <= at;
}
/**
 * Own the read, display, and acknowledgement lifecycle of bonus notices.
 * @param options - collaborators and timings.
 * @returns the controller the account plugin drives from account and settings state.
 */
export function createBonusNoticeController(options) {
    let scope;
    /** Notice currently published to the sidebar, including the expiration checked at display time. */
    let current;
    /** Newest read; an older read still in flight has its result dropped once a newer one starts. */
    let readGeneration = 0;
    let ackTimer;
    let ackInFlight = false;
    let ackDelay = options.ackRetryDelayMs;
    /** Orders the card on screen already reported, so one mount cannot acknowledge twice. */
    const reported = new Set();
    const clearAckTimer = () => { if (ackTimer !== undefined) {
        clearTimeout(ackTimer);
        ackTimer = undefined;
    } };
    const setCurrent = (notice) => {
        if (notice === undefined && current === undefined)
            return;
        if (notice?.orderId === current?.orderId && notice?.message === current?.message
            && notice?.expiresAt === current?.expiresAt)
            return;
        // A different order means a different card, so its report is a fresh one.
        if (notice?.orderId !== current?.orderId)
            reported.clear();
        current = notice;
        options.publish(notice ?? null);
    };
    const scheduleAck = (delay) => {
        clearAckTimer();
        ackTimer = setTimeout(() => { void runAcks(); }, delay);
    };
    /** Drop acknowledgement work of the previous account or lifecycle, so its carry-over cannot reach the next one. */
    const resetAcks = () => {
        clearAckTimer();
        ackInFlight = false;
        ackDelay = options.ackRetryDelayMs;
    };
    const startAcks = () => { if (scope !== undefined && scope.pending.length > 0)
        scheduleAck(0); };
    /**
     * Apply one read result. A newly offered order replaces the on-screen card;
     * an offer equal to the on-screen card refreshes its copy in place, and an
     * empty batch leaves a card the user has already seen alone.
     */
    const apply = (scopeAtRead, batch) => {
        if (scopeAtRead.accountId !== batch.accountId) {
            // A different account answered: the previous account's card and pending
            // acknowledgements belong to it and must not outlive its sign-in.
            scopeAtRead.accountId = batch.accountId;
            scopeAtRead.pending.length = 0;
            resetAcks();
            setCurrent(undefined);
        }
        const candidate = batch.bonuses[0];
        if (candidate === undefined) {
            // No candidate: a card the user has already seen stays until it is closed,
            // while a candidate that never reached a presented frame is withdrawn.
            if (current !== undefined && !reported.has(current.orderId))
                setCurrent(undefined);
            return;
        }
        if (candidate.orderId === current?.orderId) {
            // Same order still on screen: refresh its copy, and validate expiration at display time.
            setCurrent({ orderId: candidate.orderId, message: candidate.message, expiresAt: candidate.expiresAt });
            return;
        }
        if (expired(candidate.expiresAt, Date.now()))
            return;
        setCurrent({ orderId: candidate.orderId, message: candidate.message, expiresAt: candidate.expiresAt });
    };
    /**
     * Read once for one live lifecycle. A newer read supersedes one in flight: the
     * older result is dropped instead of applied, so only the newest read can report
     * an account change.
     * @param scopeAtRead - lifecycle this read belongs to.
     * @returns after this read settles.
     */
    function runRead(scopeAtRead) {
        const generation = ++readGeneration;
        return (async () => {
            let batch;
            try {
                batch = await options.read();
            }
            catch {
                // A failed read reports nothing to the user and leaves the lifecycle as
                // it stands, so a pending acknowledgement keeps retrying.
                batch = null;
            }
            if (scope !== scopeAtRead || generation !== readGeneration)
                return;
            if (batch !== null)
                apply(scopeAtRead, batch);
        })();
    }
    /**
     * Acknowledge presented orders one at a time. A protocol failure backs off up
     * to the ceiling and retries for the rest of the signed-in lifecycle, which
     * never persists. A false answer settles the order without a retry: this
     * session cannot make the server accept it. A hidden window keeps retrying,
     * because the presented frame is what a pending acknowledgement proves.
     */
    async function runAcks() {
        const scopeAtCall = scope;
        if (scopeAtCall === undefined || ackInFlight)
            return;
        const accountId = scopeAtCall.accountId;
        const orderId = scopeAtCall.pending[0];
        /* v8 ignore next -- an acknowledgement runs only while a read named the account and left a pending order */
        if (accountId === undefined || orderId === undefined)
            return;
        ackInFlight = true;
        /** @returns whether this call still owns the lifecycle and account it started for. */
        const owns = () => scope === scopeAtCall && scopeAtCall.accountId === accountId;
        let acknowledged;
        try {
            acknowledged = await options.acknowledge(accountId, orderId);
        }
        catch {
            // The lifecycle ended or another account answered while the call was in flight:
            // its pending list, in-flight flag and timer now belong to the new owner.
            if (!owns())
                return;
            ackInFlight = false;
            scheduleAck(ackDelay);
            ackDelay = Math.min(ackDelay * 2, options.ackRetryMaxDelayMs);
            return;
        }
        if (!owns())
            return;
        ackInFlight = false;
        // Success needs no record and a refusal has no retry, so either way this order
        // is settled for this lifecycle.
        /* v8 ignore next -- the call owns the scope, and this order is its head until this shift */
        if (scopeAtCall.pending[0] === orderId)
            scopeAtCall.pending.shift();
        ackDelay = options.ackRetryDelayMs;
        if (acknowledged && scopeAtCall.pending.length > 0)
            scheduleAck(0);
        else
            clearAckTimer();
    }
    /** Queue a presented order, so an acknowledgement interrupted by a failure retries within this sign-in. */
    const report = (orderId) => {
        const scopeAtReport = scope;
        if (scopeAtReport === undefined || current?.orderId !== orderId || reported.has(orderId))
            return;
        reported.add(orderId);
        if (!scopeAtReport.pending.includes(orderId))
            scopeAtReport.pending.push(orderId);
        ackDelay = options.ackRetryDelayMs;
        scheduleAck(0);
    };
    const endLifecycle = () => {
        if (scope === undefined)
            return;
        // The lifecycle a read started for is gone, so its scope check drops the result.
        resetAcks();
        scope = undefined;
        reported.clear();
        setCurrent(undefined);
    };
    return {
        begin() {
            // Re-entry is the same signed-in session: the card and its acknowledgement
            // retries stay, and this frame's own read supersedes any read still in flight,
            // so a credential swapped in place is never left unnamed.
            scope ??= { pending: [] };
            void runRead(scope);
        },
        end: endLifecycle,
        refresh() {
            if (scope === undefined)
                return Promise.resolve();
            startAcks();
            return runRead(scope);
        },
        shown(orderId) {
            if (current?.orderId !== orderId)
                return;
            if (expired(current.expiresAt, Date.now()))
                return;
            report(orderId);
        },
        dismiss(orderId) {
            if (current?.orderId !== orderId)
                return;
            // Closing the card is the user seeing it, so queue its acknowledgement before withdrawing.
            report(orderId);
            setCurrent(undefined);
        },
    };
}
//# sourceMappingURL=bonus-notices.js.map