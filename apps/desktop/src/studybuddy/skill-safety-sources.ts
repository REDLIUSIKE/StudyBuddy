/** Real installed/public sources; no target instructions enter assistant context. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SkillSafetyActor, SkillSafetyArtifactId, SkillSafetyArtifactView, SkillSafetyCandidate, SkillSafetyCandidateId, SkillSafetyCandidateSet, SkillSafetyJobId, SkillSafetyRequestId } from '@deepseek-ai/dsh-skill-safety-assistant/types'
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant'
import { SkillSafetyArtifacts, skillSafetyLocatorSchema, validateRelative, type SkillSafetyLocator, type SkillSafetyPrivateArtifact } from './skill-safety-artifacts.ts'
import { SkillSafetyJournal } from './skill-safety-journal.ts'
const text = z.string().min(1).max(256), sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/)
const sourceSchema = z.object({
  version: z.literal(1), accountId: text, generation: z.number().int().nonnegative(), sessionId: text, jobId: text,
  candidates: z.array(z.object({ candidateId: text, source: skillSafetyLocatorSchema }).strict()).max(1000),
}).strict()
/** Native-only installed metadata, without filesystem paths or runtime authority. */
export const skillSafetyNativeInventorySchema = z.object({
  revision: text, complete: z.boolean(), instances: z.array(z.object({
    instanceId: text, toolId: text, displayName: text, purpose: z.string().max(2048), contentSha256: digest,
  }).strict()).max(20000),
}).strict()
/** Strict native inventory reply at the private process boundary. */
export type SkillSafetyNativeInventory = z.infer<typeof skillSafetyNativeInventorySchema>
/** Regular-file witnesses from one native-owned snapshot. */
export const skillSafetyNativeSnapshotSchema = z.object({
  directory: z.string().min(1).max(32768), revision: text, instanceId: text, sourceDigest: digest,
  files: z.array(z.object({ relativePath: z.string().min(1).max(2048), sha256: digest, byteLength: z.number().int().nonnegative() }).strict()).min(1).max(1000),
}).strict()
/** Strict private snapshot reply; never a model-visible value. */
export type SkillSafetyNativeSnapshot = z.infer<typeof skillSafetyNativeSnapshotSchema>
/** Exact native source identities and bounded public requests. */
export interface SkillSafetySourcesOptions {
  root: string
  isCurrentScope(actor: SkillSafetyActor): boolean
  native: {
    inventory(actor: SkillSafetyActor, signal: AbortSignal): Promise<SkillSafetyNativeInventory>
    snapshot(actor: SkillSafetyActor, input: { instanceId: string; revision: string; maxBytes: number; maxFiles: number }, signal: AbortSignal): Promise<SkillSafetyNativeSnapshot>
    verify(actor: SkillSafetyActor, input: { instanceId: string; revision: string; maxBytes: number; maxFiles: number; files: SkillSafetyNativeSnapshot['files'] }, signal: AbortSignal): Promise<void>
  }
  request(url: URL, signal: AbortSignal): Promise<Response>
  limits: { maxCandidates: number; maxDownloadBytes: number; maxStagedBytes: number; maxFiles: number; maxRedirects: number; acquisitionTimeoutMs: number }
}
interface ResolvedCandidate { view: SkillSafetyCandidate; source: SkillSafetyLocator }
interface Acquisition { signal: AbortSignal; remaining: number; requests: number }
/** Finds real metadata and retains private snapshots outside active skills. */
export class SkillSafetySources {
  private readonly artifacts: SkillSafetyArtifacts
  private readonly journal: SkillSafetyJournal
  constructor(private readonly options: SkillSafetySourcesOptions) {
    for (const value of Object.values(options.limits)) if (!Number.isSafeInteger(value) || value < 1 || value >= 2147483647) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID')
    if (options.limits.maxCandidates > 1000 || options.limits.maxFiles > 1000) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT')
    this.artifacts = new SkillSafetyArtifacts({ root: join(options.root, 'artifacts'), isCurrentScope: options.isCurrentScope, maxBytes: options.limits.maxStagedBytes, maxFiles: options.limits.maxFiles })
    this.journal = new SkillSafetyJournal({ root: join(options.root, 'operations'), isCurrentScope: options.isCurrentScope })
  }
  /**
   * Find real named installed copies, then public sources only after a complete no-match.
   * @param actor - Current native account/session.
   * @param requestId - Stable operation identity.
   * @param query - Name/search terms or a public GitHub URL.
   * @param signal - Turn cancellation.
   * @returns Keyless real candidates; errors/incomplete lookup are not no-match.
   */
  async findSkillSources(actor: SkillSafetyActor, requestId: SkillSafetyRequestId, query: string, signal: AbortSignal): Promise<SkillSafetyCandidateSet> {
    this.assertScope(actor, signal)
    const normalized = query.trim()
    const record = await this.journal.reserve(actor, requestId, 'find', hash(JSON.stringify(normalized)))
    if (record.status === 'done') {
      if (record.result?.kind !== 'candidates') throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID')
      return record.result.value
    }
    const jobId = brandString<SkillSafetyJobId>(randomUUID())
    const acquisition = this.acquisition(signal)
    let candidates: ResolvedCandidate[] = [], status: SkillSafetyCandidateSet['status'] = 'no-match'
    let failure: SkillSafetyCandidateSet['failure']
    try {
      if (!normalized || normalized.length > 2048) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID')
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
        candidates = await this.githubCandidates(normalized, '', acquisition)
      } else {
        let inventory: SkillSafetyNativeInventory | undefined
        try { inventory = skillSafetyNativeInventorySchema.parse(await this.options.native.inventory(actor, acquisition.signal)) }
        catch (error) {
          this.assertScope(actor, acquisition.signal)
          status = 'incomplete'; failure = { code: 'SKILL_SAFETY_INVENTORY_INCOMPLETE', action: 'retry' }
        }
        this.assertScope(actor, acquisition.signal)
        if (inventory !== undefined) {
          const key = normalized.toLocaleLowerCase()
          candidates = inventory.instances.filter(row => (row.displayName + ' ' + row.purpose).toLocaleLowerCase().includes(key)).map(row => ({
            view: { candidateId: brandString<SkillSafetyCandidateId>(randomUUID()), kind: 'installed', displayName: row.displayName, purpose: row.purpose, sourceLabel: row.toolId },
            source: { kind: 'installed', instanceId: row.instanceId, revision: inventory.revision, sourceDigest: row.contentSha256 },
          }))
          if (!inventory.complete || candidates.length > this.options.limits.maxCandidates) { status = 'incomplete'; failure = { code: 'SKILL_SAFETY_INVENTORY_INCOMPLETE', action: 'retry' } }
          else if (candidates.length === 0) {
            const url = new URL('https://skills.sh/api/search')
            url.searchParams.set('q', normalized); url.searchParams.set('limit', String(this.options.limits.maxCandidates))
            const response = z.object({ skills: z.array(z.object({ id: z.string().max(2048), name: text, installs: z.number().nonnegative(), source: z.string().min(3).max(512) })).max(1000) }).parse(await this.json(url, acquisition))
            for (const row of response.skills.slice(0, this.options.limits.maxCandidates)) {
              if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row.source)) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID')
              candidates.push(...await this.githubCandidates('https://github.com/' + row.source, row.name, acquisition))
              if (candidates.length > this.options.limits.maxCandidates) { status = 'incomplete'; break }
            }
          }
        }
      }
      if (status !== 'incomplete') status = candidates.length ? 'matches' : 'no-match'
    } catch (error) {
      this.assertScope(actor, signal)
      if (error instanceof SkillSafetyError && error.code === 'SKILL_SAFETY_CANCELLED') throw error
      status = 'failed'; candidates = []
      failure = { code: error instanceof SkillSafetyError ? error.code : 'SKILL_SAFETY_PUBLIC_LOOKUP_FAILED', action: error instanceof SkillSafetyError && error.code === 'SKILL_SAFETY_SOURCE_INVALID' ? 'choose-source' : 'retry' }
    }
    this.assertScope(actor, signal)
    candidates = candidates.slice(0, this.options.limits.maxCandidates)
    await this.artifacts.saveJson(actor, 'catalog', jobId, sourceSchema.parse({ version: 1, accountId: actor.accountId, generation: actor.generation, sessionId: actor.sessionId, jobId, candidates: candidates.map(row => ({ candidateId: row.view.candidateId, source: row.source })) }))
    const value: SkillSafetyCandidateSet = { jobId, status, candidates: candidates.map(row => row.view), ...(failure === undefined ? {} : { failure }) }
    await this.journal.settle(actor, requestId, { kind: 'candidates', value })
    return value
  }
  /**
   * Snapshot only a previously resolved source after native confirmation.
   * @param actor - Current native account/session.
   * @param jobId - Owned lookup.
   * @param candidateId - One candidate from that lookup.
   * @param signal - Turn cancellation.
   * @returns Immutable keyless artifact identity; target code is not executed.
   */
  async snapshotSkillSource(actor: SkillSafetyActor, jobId: SkillSafetyJobId, candidateId: SkillSafetyCandidateId, signal: AbortSignal): Promise<SkillSafetyArtifactView> {
    this.assertScope(actor, signal)
    const catalog = sourceSchema.parse(await this.artifacts.readJson(actor, 'catalog', jobId))
    if (catalog.accountId !== actor.accountId || catalog.generation !== actor.generation || catalog.sessionId !== actor.sessionId || catalog.jobId !== jobId) throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE')
    const source = catalog.candidates.find(row => row.candidateId === candidateId)?.source
    if (source === undefined) throw new SkillSafetyError('SKILL_SAFETY_CANDIDATE_NOT_FOUND')
    const acquisition = this.acquisition(signal)
    if (source.kind === 'installed') {
      const snapshot = skillSafetyNativeSnapshotSchema.parse(await this.options.native.snapshot(actor, this.nativeIdentity(source), acquisition.signal))
      this.assertScope(actor, acquisition.signal)
      if (snapshot.instanceId !== source.instanceId || snapshot.revision !== source.revision || snapshot.sourceDigest !== source.sourceDigest) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED')
      return this.artifacts.accept(actor, jobId, source, snapshot.directory, snapshot.files)
    }
    const directory = await this.artifacts.createStage(actor), files: SkillSafetyNativeSnapshot['files'] = []
    let bytes = 0
    for (const entry of source.files) {
      this.assertScope(actor, acquisition.signal)
      const reply = z.object({ sha, size: z.number().int().nonnegative(), encoding: z.literal('base64'), content: z.string() }).parse(await this.json(new URL('https://api.github.com/repos/' + source.owner + '/' + source.repository + '/git/blobs/' + entry.sha), acquisition))
      const content = reply.content.replace(/\n/g, '')
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID')
      const data = Buffer.from(content, 'base64')
      bytes += data.length
      if (bytes > this.options.limits.maxStagedBytes || bytes > this.options.limits.maxDownloadBytes) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT')
      const blobHash = createHash('sha1').update(Buffer.from('blob ' + data.length + '\0')).update(data).digest('hex')
      if (reply.sha !== entry.sha || reply.size !== entry.size || data.length !== entry.size || blobHash !== entry.sha) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED')
      validateRelative(entry.relativePath)
      const destination = join(directory, entry.relativePath)
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
      const handle = await open(destination, 'wx', 0o600)
      try { await handle.writeFile(data); await handle.sync() } finally { await handle.close() }
      files.push({ relativePath: entry.relativePath, sha256: hash(data), byteLength: data.length })
    }
    this.assertScope(actor, acquisition.signal)
    return this.artifacts.accept(actor, jobId, source, directory, files)
  }
  /**
   * Recheck private snapshot and original installed identity before using it.
   * @param actor - Current native account/session.
   * @param artifactId - Accepted snapshot.
   * @returns Private scanner data, never a model or renderer result.
   */
  async readSkillArtifact(actor: SkillSafetyActor, artifactId: SkillSafetyArtifactId): Promise<SkillSafetyPrivateArtifact> {
    this.assertScope(actor)
    const artifact = await this.artifacts.readSkillArtifact(actor, artifactId)
    if (artifact.source.kind === 'installed') await this.options.native.verify(actor, { ...this.nativeIdentity(artifact.source), files: [...artifact.files] }, AbortSignal.timeout(this.options.limits.acquisitionTimeoutMs))
    this.assertScope(actor)
    return artifact
  }
  private nativeIdentity(source: Extract<SkillSafetyLocator, { kind: 'installed' }>) { return { instanceId: source.instanceId, revision: source.revision, maxBytes: this.options.limits.maxStagedBytes, maxFiles: this.options.limits.maxFiles } }
  private acquisition(signal: AbortSignal): Acquisition { return { signal: AbortSignal.any([signal, AbortSignal.timeout(this.options.limits.acquisitionTimeoutMs)]), remaining: this.options.limits.maxDownloadBytes, requests: 0 } }
  private assertScope(actor: SkillSafetyActor, signal?: AbortSignal) {
    if (!this.options.isCurrentScope(actor)) throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE')
    if (signal?.aborted) throw new SkillSafetyError('SKILL_SAFETY_CANCELLED')
  }
  private async githubCandidates(input: string, named: string, acquisition: Acquisition): Promise<ResolvedCandidate[]> {
    const raw = decodeURIComponent(input)
    if (raw.includes('\\') || raw.split('/').some(part => part === '..' || part === '.' || part.includes('%'))) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID')
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID')
    const parts = url.pathname.replace(/\/$/, '').split('/').slice(1), owner = parts[0], repository = parts[1]
    if (!owner || !repository || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository) || (parts.length > 2 && (parts[2] !== 'tree' || !parts[3]))) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID')
    const base = 'https://api.github.com/repos/' + owner + '/' + repository
    const repo = z.object({ default_branch: text }).parse(await this.json(new URL(base), acquisition))
    const ref = parts[3] ?? repo.default_branch, selected = parts.slice(4).join('/')
    if (selected) validateRelative(selected)
    const commit = z.object({ sha, commit: z.object({ tree: z.object({ sha }) }) }).parse(await this.json(new URL(base + '/commits/' + encodeURIComponent(ref)), acquisition))
    const tree = z.object({ truncated: z.boolean(), tree: z.array(z.object({ path: z.string().max(2048), mode: text, type: text, sha, size: z.number().int().nonnegative().optional() })).max(100000) }).parse(await this.json(new URL(base + '/git/trees/' + commit.commit.tree.sha + '?recursive=1'), acquisition))
    if (tree.truncated) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT')
    const roots = tree.tree.filter(row => row.type === 'blob' && (row.path === 'SKILL.md' || row.path.endsWith('/SKILL.md')))
      .map(row => row.path === 'SKILL.md' ? '' : row.path.slice(0, -9))
      .filter(path => (!selected || path === selected || path.startsWith(selected + '/')) && (!named || path.split('/').at(-1) === named || (!path && repository === named)))
    const results: ResolvedCandidate[] = []
    for (const path of roots.slice(0, this.options.limits.maxCandidates + 1)) {
      const entries = tree.tree.filter(row => path ? row.path.startsWith(path + '/') : true), files: Extract<SkillSafetyLocator, { kind: 'github' }>['files'] = []
      let size = 0
      for (const entry of entries) {
        const relativePath = path ? entry.path.slice(path.length + 1) : entry.path
        validateRelative(relativePath)
        if (entry.type === 'tree' && entry.mode === '040000') continue
        if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || entry.size === undefined) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE')
        size += entry.size
        if (files.length >= this.options.limits.maxFiles || size > this.options.limits.maxStagedBytes || size > this.options.limits.maxDownloadBytes) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT')
        files.push({ relativePath, sha: entry.sha, size: entry.size })
      }
      if (new Set(files.map(row => row.relativePath.toLowerCase())).size !== files.length) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE')
      const sourceUrl = 'https://github.com/' + owner + '/' + repository + '/tree/' + commit.sha + (path ? '/' + path.split('/').map(encodeURIComponent).join('/') : '')
      results.push({ view: { candidateId: brandString<SkillSafetyCandidateId>(randomUUID()), kind: 'github', displayName: path.split('/').at(-1) || repository, purpose: '', sourceLabel: owner + '/' + repository, sourceUrl },
        source: { kind: 'github', owner, repository, revision: commit.sha, path, files } })
    }
    return results
  }
  private async json(url: URL, acquisition: Acquisition): Promise<unknown> {
    for (let redirect = 0; ; redirect++) {
      if (++acquisition.requests > this.options.limits.maxCandidates * 4 + this.options.limits.maxFiles + 4) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT')
      if (url.protocol !== 'https:' || !['api.github.com', 'skills.sh'].includes(url.hostname) || url.port || url.username || url.password) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE')
      const response = await this.options.request(url, acquisition.signal)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location || redirect >= this.options.limits.maxRedirects) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE')
        const next = new URL(location, url)
        if (next.hostname !== url.hostname) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE')
        url = next; continue
      }
      if (response.status !== 200) { await response.body?.cancel(); throw new Error('public source request failed') }
      if (Number(response.headers.get('content-length') ?? 0) > acquisition.remaining) { await response.body?.cancel(); throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT') }
      const reader = response.body?.getReader()
      if (!reader) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID')
      const chunks: Uint8Array[] = []
      try {
        for (;;) {
          acquisition.signal.throwIfAborted()
          const chunk = await reader.read()
          if (chunk.done) break
          acquisition.remaining -= chunk.value.byteLength
          if (acquisition.remaining < 0) throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT')
          chunks.push(chunk.value)
        }
      } finally { await reader.cancel(); reader.releaseLock() }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    }
  }
}
function hash(value: string | Buffer) { return createHash('sha256').update(value).digest('hex') }
