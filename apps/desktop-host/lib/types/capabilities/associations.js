import { createHash } from 'node:crypto';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
const target = z.strictObject({ moduleId: z.string(), projectRef: z.string() });
const association = z.strictObject({ accountId: z.string(), owner: z.string(), originSessionId: z.string(), target, operationRef: z.string().nullable() });
const artifact = z.strictObject({ accountId: z.string(), originSessionId: z.string(), artifactRef: z.string(), moduleId: z.string(), schemaRef: z.string(), mime: z.string(), bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const mediaLink = z.strictObject({ accountId: z.string(), originSessionId: z.string(), originToolCallId: z.string(), requestId: z.string().uuid(), modelId: z.string(), fundingSource: z.enum(['platform', 'user_api']) });
const spec = defineDomain({ name: 'studybuddy_capabilities', version: 1, tables: {
        associations: domainTable(association),
        operations: domainTable(association),
        artifacts: domainTable(artifact),
        media_links: domainTable(mediaLink),
    } });
const key = (values) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const owner = (caller) => caller.workspaceId === null ? 'session:' + caller.callerSessionId : 'workspace:' + caller.workspaceId;
/** Durable references only. Scope generations are re-authorized by Main, never restored as grants. */
export class CapabilityAssociationStore {
    ctx;
    opened;
    closing;
    constructor(ctx) {
        this.ctx = ctx;
    }
    open() {
        if (this.closing)
            return Promise.reject(Error('CAPABILITY_STORE_CLOSED'));
        return this.opened ??= this.ctx.storageDomain.open(spec);
    }
    close() { return this.closing ??= Promise.resolve().then(async () => { await (await this.opened)?.close(); }); }
    async find(caller, moduleId) {
        const domain = await this.open();
        return [...domain.table('associations').entries()].map(([, row]) => row)
            .filter(row => row.accountId === caller.scope.accountId && row.owner === owner(caller) && row.target.moduleId === moduleId).map(row => ({ ...row.target }));
    }
    async link(caller, target, operationRef) {
        const domain = await this.open();
        const row = {
            accountId: caller.scope.accountId, owner: owner(caller), originSessionId: caller.callerSessionId, target: { ...target }, operationRef,
        };
        if (operationRef !== null)
            await domain.table('operations').put(key([caller.scope.accountId, caller.callerSessionId, operationRef]), row);
        await domain.table('associations').put(key([caller.scope.accountId, owner(caller), target.moduleId, target.projectRef]), row);
    }
    async recordArtifact(caller, artifact) {
        const domain = await this.open();
        await domain.table('artifacts').put(key([caller.scope.accountId, artifact.artifactRef]), { accountId: caller.scope.accountId, ...artifact });
    }
    async operation(caller, operationRef) {
        const domain = await this.open();
        return domain.table('operations').get(key([caller.scope.accountId, caller.callerSessionId, operationRef]));
    }
    async recordMediaLink(caller, input) {
        const domain = await this.open(), row = mediaLink.parse({ accountId: caller.scope.accountId, originSessionId: caller.callerSessionId, originToolCallId: caller.toolCallId, ...input }), id = key([caller.scope.accountId, input.requestId]), table = domain.table('media_links'), prior = await table.get(id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(row))
            throw Error('CAPABILITY_MEDIA_LINK_CONFLICT');
        await table.put(id, row);
    }
}
//# sourceMappingURL=associations.js.map