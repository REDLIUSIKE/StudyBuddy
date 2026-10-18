/** Profile-owned source and allocation metadata; no Session transcripts are stored here. */
import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
const sourceId = z.string().transform(value => value);
const sourceFolder = z.object({ sourceId, path: z.string() });
const managedAllocation = z.object({ path: z.string(), ready: z.boolean() });
const allocation = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('project'),
        fingerprint: z.string(),
        workspaceId: z.string().transform(value => value),
        title: z.string(),
        sourceFolders: z.array(sourceFolder).min(1),
        primarySourceId: sourceId,
        managed: managedAllocation.optional(),
        committed: z.boolean(),
    }),
    z.object({
        kind: z.literal('chat'),
        fingerprint: z.literal('chat'),
        sessionId: z.string().transform(value => value),
        managed: managedAllocation,
    }),
]);
/** Data lives in the existing profile's StorageDomain route, not browser storage. */
export const projectDirectorySpec = defineDomain({
    name: 'project_directory',
    version: 1,
    global: {
        schema: z.object({ namespace: z.uuid().nullable() }),
        initial: { namespace: null },
    },
    tables: {
        sources: domainTable(sourceFolder),
        allocations: domainTable(allocation),
    },
});
//# sourceMappingURL=project-directory-spec.js.map