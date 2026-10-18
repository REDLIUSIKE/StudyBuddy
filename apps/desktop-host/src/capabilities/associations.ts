import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { HarnessCapabilityCallerV1 } from '@studybuddy/contracts'
import type { CapabilityArtifact, CapabilityTarget } from './types.ts'

const target = z.strictObject({ moduleId: z.string(), projectRef: z.string() })
const association = z.strictObject({ accountId: z.string(), owner: z.string(), originSessionId: z.string(), target, operationRef: z.string().nullable() })
const artifact = z.strictObject({ accountId: z.string(), originSessionId: z.string(), artifactRef: z.string(), moduleId: z.string(), schemaRef: z.string(), mime: z.string(), bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
const mediaLink=z.strictObject({accountId:z.string(),originSessionId:z.string(),originToolCallId:z.string(),requestId:z.string().uuid(),modelId:z.string(),fundingSource:z.enum(['platform','user_api'])})
const spec = defineDomain({ name: 'studybuddy_capabilities', version: 1, tables: {
  associations: domainTable<string, z.infer<typeof association>>(association),
  operations: domainTable<string, z.infer<typeof association>>(association),
  artifacts: domainTable<string, z.infer<typeof artifact>>(artifact),
  media_links:domainTable<string,z.infer<typeof mediaLink>>(mediaLink),
} })
const key = (values: unknown[]) => createHash('sha256').update(JSON.stringify(values)).digest('hex')
const owner = (caller: HarnessCapabilityCallerV1) => caller.workspaceId === null ? 'session:' + caller.callerSessionId : 'workspace:' + caller.workspaceId

/** Durable references only. Scope generations are re-authorized by Main, never restored as grants. */
export class CapabilityAssociationStore {
  private opened: Promise<Domain<typeof spec>> | undefined
  private closing: Promise<void> | undefined
  constructor(private readonly ctx: Context) {}
  private open(): Promise<Domain<typeof spec>> {
    if (this.closing) return Promise.reject(Error('CAPABILITY_STORE_CLOSED'))
    return this.opened ??= this.ctx.storageDomain.open(spec)
  }
  close(): Promise<void> { return this.closing ??= Promise.resolve().then(async () => { await (await this.opened)?.close() }) }
  async find(caller: HarnessCapabilityCallerV1, moduleId: string): Promise<CapabilityTarget[]> {
    const domain = await this.open()
    return [...domain.table('associations').entries()].map(([, row]) => row)
      .filter(row => row.accountId === caller.scope.accountId && row.owner === owner(caller) && row.target.moduleId === moduleId).map(row => ({ ...row.target }))
  }
  async link(caller: HarnessCapabilityCallerV1, target: CapabilityTarget, operationRef: string | null): Promise<void> {
    const domain = await this.open()
    const row = {
      accountId: caller.scope.accountId, owner: owner(caller), originSessionId: caller.callerSessionId, target: { ...target }, operationRef,
    }
    if (operationRef !== null) await domain.table('operations').put(key([caller.scope.accountId, caller.callerSessionId, operationRef]), row)
    await domain.table('associations').put(key([caller.scope.accountId, owner(caller), target.moduleId, target.projectRef]), row)
  }
  async recordArtifact(caller: HarnessCapabilityCallerV1, artifact: CapabilityArtifact): Promise<void> {
    const domain = await this.open()
    await domain.table('artifacts').put(key([caller.scope.accountId, artifact.artifactRef]), { accountId: caller.scope.accountId, ...artifact })
  }
  async operation(caller: HarnessCapabilityCallerV1, operationRef: string): Promise<z.infer<typeof association> | undefined> {
    const domain = await this.open()
    return domain.table('operations').get(key([caller.scope.accountId, caller.callerSessionId, operationRef]))
  }
  async recordMediaLink(caller:HarnessCapabilityCallerV1,input:{requestId:string;modelId:string;fundingSource:'platform'|'user_api'}){
    const domain=await this.open(),row=mediaLink.parse({accountId:caller.scope.accountId,originSessionId:caller.callerSessionId,originToolCallId:caller.toolCallId,...input}),id=key([caller.scope.accountId,input.requestId]),table=domain.table('media_links'),prior=await table.get(id)
    if(prior&&JSON.stringify(prior)!==JSON.stringify(row))throw Error('CAPABILITY_MEDIA_LINK_CONFLICT')
    await table.put(id,row)
  }
}
