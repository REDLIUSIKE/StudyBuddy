import { ObservableState, sameScope, errorCode } from "./observable.js";
const initial = (scope) => ({ scope, platform: null, detail: null, own: [], busy: false, errorCode: null, stale: false });
const recorded = (row) => row.state === 'connected' && (row.schemaVersion === 3 ? row.grantRevision !== null : row.fundingSource === 'user_api');
/** Validates attribution after the carrier has validated the original wire DTO. */
export function assertNativeUsageMatches(owner, connection, page) {
    let invalid = page.accountOwner !== owner || page.toolId !== connection.toolId || page.protocol !== connection.protocol;
    if (connection.schemaVersion === 3) {
        invalid ||= page.schemaVersion !== 3 || connection.grantRevision !== page.binding.grantRevision || page.records.some(row => !connection.allowedModelIds.includes(row.modelId));
    }
    else {
        const authority = connection.authority;
        invalid ||= page.schemaVersion !== 2 || page.records.some(row => row.modelId !== connection.appliedExactModelId);
        if (page.schemaVersion === 2 && authority !== null)
            invalid ||= authority.accountOwner !== owner || page.deviceId !== authority.deviceId || page.binding.authorityHandle !== authority.authorityHandle || page.binding.bindingRevision !== authority.bindingRevision || page.binding.credentialRevision !== authority.credentialRevision || page.binding.policyRevision !== authority.policyRevision;
    }
    if (invalid)
        throw new Error('NATIVE_USAGE_BINDING_CHANGED');
}
export class UsageController extends ObservableState {
    api;
    #epoch = 0;
    #request = 0;
    constructor(api) {
        super(initial(null));
        this.api = api;
    }
    setScope(scope) { if (sameScope(scope, this.snapshot.scope))
        return; ++this.#epoch; ++this.#request; this.publish(initial(scope)); }
    async loadPlatform(page = 1, pageSize = 20) {
        await this.run(async () => ({ platform: await this.api.listAiUsage(page, pageSize), detail: null }));
    }
    async loadPlatformDetail(id) { await this.run(async () => ({ detail: await this.api.getAiUsageDetail(id) })); }
    closeDetail = () => { this.publish({ ...this.snapshot, detail: null }); };
    async loadOwn() {
        const scope = this.snapshot.scope;
        if (!scope)
            return;
        await this.run(async () => {
            const connections = await this.api.listNativeConnectionUi();
            const own = await Promise.all(connections.filter(recorded).map(async (connection) => {
                const page = await this.api.getNativeToolUserApiUsage(connection.toolId, { createdAt: 0, requestId: '' }, 100);
                assertNativeUsageMatches(scope.accountId, connection, page);
                return page;
            }));
            return { own };
        });
    }
    async nextOwn(toolId) {
        const scope = this.snapshot.scope, previous = this.snapshot.own.find(row => row.toolId === toolId);
        if (!scope || !previous?.nextCursor || this.snapshot.busy)
            return;
        await this.run(async () => {
            const connection = (await this.api.listNativeConnectionUi()).find(row => row.toolId === toolId && recorded(row));
            if (!connection)
                throw new Error('NATIVE_USAGE_BINDING_CHANGED');
            const next = await this.api.getNativeToolUserApiUsage(toolId, previous.nextCursor, 100);
            assertNativeUsageMatches(scope.accountId, connection, next);
            if (previous.schemaVersion !== next.schemaVersion || JSON.stringify(previous.binding) !== JSON.stringify(next.binding) || next.records.some(row => previous.records.some(old => old.requestId === row.requestId)))
                throw new Error('NATIVE_USAGE_BINDING_CHANGED');
            const merged = { ...next, records: [...previous.records, ...next.records] };
            return { own: this.snapshot.own.map(row => row.toolId === toolId ? merged : row) };
        });
    }
    async run(read) {
        if (!this.snapshot.scope)
            return;
        const epoch = this.#epoch, request = ++this.#request;
        this.publish({ ...this.snapshot, busy: true, errorCode: null });
        try {
            const result = await read();
            if (epoch === this.#epoch && request === this.#request)
                this.publish({ ...this.snapshot, ...result, stale: false });
        }
        catch (error) {
            if (epoch === this.#epoch && request === this.#request)
                this.publish({ ...this.snapshot, errorCode: errorCode(error), stale: this.snapshot.platform !== null || this.snapshot.own.length > 0 });
        }
        finally {
            if (epoch === this.#epoch && request === this.#request)
                this.publish({ ...this.snapshot, busy: false });
        }
    }
    dispose() { this.setScope(null); super.dispose(); }
}
//# sourceMappingURL=usage-controller.js.map