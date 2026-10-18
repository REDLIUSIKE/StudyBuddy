/** What a `RemoteMock` saw: answered calls, opened streams, and requests without a rule. */
/** The mock's log store. */
export class MockLogStore {
    callEntries = [];
    streamEntries = [];
    missEntries = [];
    seq = 0;
    calls(endpoint) {
        return this.callEntries.filter(entry => endpoint === undefined || entry.endpoint === endpoint);
    }
    streams(endpoint) {
        return this.streamEntries.filter(entry => endpoint === undefined || entry.endpoint === endpoint);
    }
    requests(endpoint) {
        const entries = [...this.calls(endpoint), ...this.streams(endpoint)];
        return entries
            .filter(entry => endpoint !== undefined || !entry.endpoint.startsWith('$'))
            .sort((a, b) => a.seq - b.seq)
            .map(entry => entry.args[0]);
    }
    unmatched() {
        return [...this.missEntries];
    }
    /**
     * Record one call whose rule was selected.
     * @param endpoint - endpoint.
     * @param args - positional args.
     * @returns the mutable entry the dispatcher settles.
     */
    call(endpoint, args) {
        const record = { endpoint, args, state: 'pending', result: undefined, seq: ++this.seq };
        this.callEntries.push(record);
        return record;
    }
    /**
     * Record one stream open.
     * @param endpoint - endpoint.
     * @param args - positional args.
     * @returns the mutable entry the stream updates.
     */
    stream(endpoint, args) {
        const record = { endpoint, args, state: 'open', pushed: 0, seq: ++this.seq };
        this.streamEntries.push(record);
        return record;
    }
    /**
     * Record one request without a rule.
     * @param endpoint - endpoint.
     * @param mode - how it was requested.
     */
    miss(endpoint, mode) {
        this.missEntries.push({ endpoint, mode });
    }
}
//# sourceMappingURL=log.js.map