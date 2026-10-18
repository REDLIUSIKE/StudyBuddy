const key = (caller, target) => JSON.stringify([caller.scope, caller.hostGeneration, target]);
/** One controller per account/document. Releases preserve common pages until an explicit handoff or logout. */
export class CapabilityCanvasViews {
    options;
    rows = new Map();
    closing;
    constructor(options) {
        this.options = options;
    }
    assert(caller) { if (this.closing)
        throw Error('CAPABILITY_VIEWS_CLOSED'); this.options.assert(caller); }
    async acquire(caller, target) {
        this.assert(caller);
        const id = key(caller, target);
        let row = this.rows.get(id);
        if (row?.handoff) {
            await row.handoff;
            return this.acquire(caller, target);
        }
        if (!row) {
            row = { controller: Promise.resolve(null), refs: 0, drains: new Set() };
            const owned = row;
            row.controller = Promise.resolve().then(async () => {
                let controller;
                try {
                    controller = await this.options.find(caller, target) ?? await this.options.create(caller, target);
                    await controller.ready();
                    this.assert(caller);
                    return controller;
                }
                catch (error) {
                    try {
                        await controller?.close();
                    }
                    finally {
                        if (this.rows.get(id) === owned)
                            this.rows.delete(id);
                    }
                    throw error;
                }
            });
            this.rows.set(id, row);
        }
        row.refs++;
        let released = false;
        const release = async () => { if (released)
            return; released = true; if (--row.refs === 0) {
            for (const done of row.drains)
                done();
            row.drains.clear();
        } };
        try {
            const controller = await row.controller;
            this.assert(caller);
            return { controller, state: async () => { this.assert(caller); if (released)
                    throw Error('CAPABILITY_CANVAS_LEASE_RELEASED'); const value = await controller.state(); this.assert(caller); return value; }, release };
        }
        catch (error) {
            await release();
            throw error;
        }
    }
    async handoff(caller, target, successorRef) {
        this.assert(caller);
        const id = key(caller, target), row = this.rows.get(id);
        if (!row)
            return;
        if (!row.handoff)
            row.handoff = Promise.resolve().then(async () => {
                const controller = await row.controller;
                if (controller.owned === false) {
                    if (controller.id === successorRef)
                        return;
                    throw Error('AIGC_CANVAS_ALREADY_OPEN');
                }
                if (row.refs)
                    await new Promise(resolve => row.drains.add(resolve));
                try {
                    this.assert(caller);
                    await controller.flush();
                    this.assert(caller);
                }
                finally {
                    await controller.close();
                    if (this.rows.get(id) === row)
                        this.rows.delete(id);
                }
            }).finally(() => { delete row.handoff; });
        return row.handoff;
    }
    close() {
        return this.closing ??= Promise.resolve().then(async () => {
            const rows = [...this.rows.values()];
            this.rows.clear();
            await Promise.allSettled(rows.map(async (row) => { const controller = await row.controller; await controller.close(); }));
        });
    }
    async revoke() { const rows = [...this.rows.values()]; this.rows.clear(); await Promise.allSettled(rows.map(async (row) => { const controller = await row.controller; await controller.close(); })); }
}
//# sourceMappingURL=views.js.map