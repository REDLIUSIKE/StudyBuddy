/** Profile-owned source and allocation metadata; no Session transcripts are stored here. */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ProjectRequestId, WorkspaceId, WorkspaceSourceId } from '@deepseek-ai/dsh-workspace/types'

const sourceId = z.string().transform(value => value as WorkspaceSourceId)
const sourceFolder = z.object({ sourceId, path: z.string() })
const managedAllocation = z.object({ path: z.string(), ready: z.boolean() })
const allocation = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('project'),
    fingerprint: z.string(),
    workspaceId: z.string().transform(value => value as WorkspaceId),
    title: z.string(),
    sourceFolders: z.array(sourceFolder).min(1),
    primarySourceId: sourceId,
    managed: managedAllocation.optional(),
    committed: z.boolean(),
  }),
  z.object({
    kind: z.literal('chat'),
    fingerprint: z.literal('chat'),
    sessionId: z.string().transform(value => value as SessionId),
    managed: managedAllocation,
  }),
])

/** Exact allocation intent retained across lost replies or partial preparation. */
export type ProjectAllocation = z.infer<typeof allocation>

/** Data lives in the existing profile's StorageDomain route, not browser storage. */
export const projectDirectorySpec = defineDomain({
  name: 'project_directory',
  version: 1,
  global: {
    schema: z.object({ namespace: z.uuid().nullable() }),
    initial: { namespace: null },
  },
  tables: {
    sources: domainTable<WorkspaceSourceId, z.infer<typeof sourceFolder>>(sourceFolder),
    allocations: domainTable<ProjectRequestId, ProjectAllocation>(allocation),
  },
})
