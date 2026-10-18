import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/**
 * The one URL scheme resource addresses use: `dsh-resource://<type>/…`, where
 * the host names the protocol. Other schemes (`sidebar://…`) are navigation
 * addresses and name no resource.
 */
export const RESOURCE_SCHEME = 'dsh-resource';
/**
 * The protocol key of one address: the host of a `dsh-resource://` URL, as the
 * URL parser reads it (lower-cased). Any other string — another scheme, or one
 * the URL parser rejects — names no protocol and is treated like an address
 * whose protocol has no provider.
 * @param address - the full address.
 * @returns the protocol key, or `undefined` when the address is not a resource address.
 */
export function protocolOf(address) {
    let parsed;
    try {
        parsed = new URL(address);
    }
    catch {
        // The URL parser rejects strings without a scheme (`/a/b.txt`, `''`);
        // nothing else throws here, and an unparseable address is simply not ours.
        return undefined;
    }
    if (parsed.protocol !== `${RESOURCE_SCHEME}:`)
        return undefined;
    // A non-special scheme's host is opaque to the URL parser and keeps its case.
    return parsed.hostname === '' ? undefined : parsed.hostname.toLowerCase();
}
function idle(status) {
    return { status, value: undefined, failure: undefined };
}
/** The `ctx.resources` implementation. */
export class ResourceRegistry {
    ctx;
    providers = new Map();
    records = new Map();
    /** @param ctx - Context whose effects own the registered providers. */
    constructor(ctx) {
        this.ctx = ctx;
    }
    register(provider) {
        const runtime = provider;
        const { protocol } = runtime;
        if (this.providers.has(protocol)) {
            throw new Error(`resources: protocol "${protocol}" already has a provider`);
        }
        const dispose = this.ctx.effect(() => {
            this.providers.set(protocol, runtime);
            for (const record of this.recordsOf(protocol))
                this.attach(record);
            return () => {
                this.providers.delete(protocol);
                for (const record of this.recordsOf(protocol))
                    this.detach(record);
            };
        }, `resources.register(${JSON.stringify(protocol)})`);
        return () => { void dispose(); };
    }
    pin(address, signal) {
        if (signal.aborted)
            return;
        const record = this.record(address);
        this.hold(record);
        signal.addEventListener('abort', () => { this.release(record); }, { once: true });
    }
    source(address) {
        return this.record(address).source;
    }
    record(address) {
        let record = this.records.get(address);
        if (record === undefined) {
            record = this.create(address);
            this.records.set(address, record);
        }
        return record;
    }
    create(address) {
        const protocol = protocolOf(address);
        const store = createSnapshotStore(idle(this.providerOf(protocol) === undefined ? 'none' : 'loading'));
        const record = {
            address,
            protocol,
            store,
            holders: 0,
            controller: undefined,
            source: {
                getSnapshot: () => store.getSnapshot(),
                subscribe: (listener) => {
                    const unsubscribe = store.subscribe(listener);
                    this.hold(record);
                    let active = true;
                    return () => {
                        if (!active)
                            return;
                        active = false;
                        unsubscribe();
                        this.release(record);
                    };
                },
            },
        };
        return record;
    }
    providerOf(protocol) {
        return protocol === undefined ? undefined : this.providers.get(protocol);
    }
    *recordsOf(protocol) {
        for (const record of this.records.values()) {
            if (record.protocol === protocol)
                yield record;
        }
    }
    hold(record) {
        record.holders += 1;
        if (record.holders === 1)
            this.start(record);
    }
    release(record) {
        record.holders -= 1;
        if (record.holders > 0)
            return;
        this.stop(record);
        record.store.set(idle(this.providerOf(record.protocol) === undefined ? 'none' : 'loading'));
    }
    /** The provider arrived: a held record opens its stream, an idle one turns `loading`. */
    attach(record) {
        if (record.holders > 0) {
            this.start(record);
            return;
        }
        record.store.set(idle('loading'));
    }
    /** The provider left: the stream ends and the record reports `none`. */
    detach(record) {
        this.stop(record);
        record.store.set(idle('none'));
    }
    start(record) {
        const provider = this.providerOf(record.protocol);
        if (provider === undefined)
            return;
        const controller = new AbortController();
        record.controller = controller;
        if (record.store.getSnapshot().status !== 'loading')
            record.store.set(idle('loading'));
        void this.consume(record, provider, controller.signal);
    }
    stop(record) {
        record.controller?.abort();
        record.controller = undefined;
    }
    /** Failures arrive as frames; a throw inside the stream is left to surface. */
    async consume(record, provider, signal) {
        const stream = provider.open(record.address, { signal });
        for await (const frame of stream) {
            // A frame the provider yields after the release that aborted it belongs
            // to nobody; ending the loop also returns the iterator.
            if (signal.aborted)
                break;
            record.store.set(frame.ok
                ? { status: 'live', value: frame.value, failure: undefined }
                : { status: 'failed', value: record.store.getSnapshot().value, failure: frame.error });
        }
    }
}
//# sourceMappingURL=resources.js.map