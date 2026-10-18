/** Forwards member metadata changes to one document preview. */
export class ResourceGroup {
    resources;
    changed;
    members = new Map();
    /** @param resources - shared file sources. @param changed - marks the owning preview stale. */
    constructor(resources, changed) {
        this.resources = resources;
        this.changed = changed;
    }
    /**
     * Subscribe once; initial metadata establishes the baseline for later changes.
     * @param address - complete resource address.
     */
    add(address) {
        if (this.members.has(address))
            return;
        const source = this.resources.source(address);
        let previous;
        const observe = () => {
            const next = source.getSnapshot();
            if (next.status !== 'live' && next.status !== 'failed')
                return;
            const key = next.status === 'live' ? `live:${next.value?.version}` : `failed:${next.failure?.code}`;
            const changed = previous !== undefined && key !== previous;
            previous = key;
            if (changed)
                this.changed();
        };
        this.members.set(address, source.subscribe(observe));
        observe();
    }
    /**
     * Release dependencies absent from the current document.
     * @param addresses - complete membership of the latest document load.
     */
    set(addresses) {
        const retained = new Set(addresses);
        for (const address of retained)
            this.add(address);
        for (const [address, release] of this.members) {
            if (retained.has(address))
                continue;
            this.members.delete(address);
            release();
        }
    }
    /** Release every member when the preview tab ends. */
    close() {
        this.set([]);
    }
}
//# sourceMappingURL=resource-group.js.map