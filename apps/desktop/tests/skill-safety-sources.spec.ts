import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, onTestFinished } from 'vitest'
import { SkillSafetySources } from '../src/studybuddy/skill-safety-sources.ts'
import type { SkillSafetyActor, SkillSafetyRequestId } from '@deepseek-ai/dsh-skill-safety-assistant/types'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'studybuddy-safety-source-'))
  onTestFinished(async () => {
    const target = resolve(root)
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.includes('studybuddy-safety-source-')) throw new Error('unsafe cleanup')
    await rm(target, { recursive: true, force: true })
  })
  const actor: SkillSafetyActor = { accountId: 'account-one', generation: 1, sessionId: SessionId('session-one') }
  const installed = { revision: 'scan_fixture', complete: true, instances: [
    { instanceId: 'instance_claude', toolId: 'claude_code', displayName: 'pdf', purpose: 'Read PDF files', contentSha256: 'a'.repeat(64) },
    { instanceId: 'instance_harness', toolId: 'deepseek_harness', displayName: 'pdf', purpose: 'Read PDF files', contentSha256: 'b'.repeat(64) },
  ] }
  const requests: string[] = []
  let current = true
  const options = {
    root: join(root, 'private'),
    isCurrentScope: (scope: SkillSafetyActor) => current && scope.accountId === actor.accountId && scope.generation === actor.generation,
    native: {
      inventory: async () => installed,
      verify: async () => {},
      snapshot: async () => { throw new Error('unexpected installed snapshot') },
    },
    request: async (url: URL) => { requests.push(url.href); return new Response(JSON.stringify({ skills: [] })) },
    limits: { maxCandidates: 20, maxDownloadBytes: 10 * 1024 * 1024, maxStagedBytes: 25 * 1024 * 1024, maxFiles: 1000, maxRedirects: 3, acquisitionTimeoutMs: 60_000 },
  }
  return { root, actor, installed, requests, options, revoke: () => { current = false }, signal: new AbortController().signal }
}
const rid = (value: string) => value as SkillSafetyRequestId

function githubFixture() {
  const bytes = Buffer.from('---\nname: pdf\ndescription: Read PDF files\n---\nRead as data.\n')
  const blobSha = createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex')
  const calls: string[] = []
  const tree = { truncated: false, tree: [
    { path: 'skills/pdf/SKILL.md', mode: '100644', type: 'blob', sha: blobSha, size: bytes.length },
    { path: 'skills/ppt/SKILL.md', mode: '100644', type: 'blob', sha: blobSha, size: bytes.length },
  ] }
  const request = async (url: URL) => {
    calls.push(url.pathname)
    const data = url.pathname === '/repos/example/skills' ? { default_branch: 'main' }
      : url.pathname === '/repos/example/skills/commits/main' ? { sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } }
        : url.pathname === '/repos/example/skills/git/trees/' + 'd'.repeat(40) ? tree
          : url.pathname === '/repos/example/skills/git/blobs/' + blobSha ? { sha: blobSha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') }
            : undefined
    if (data === undefined) throw new Error('unexpected public request')
    return new Response(JSON.stringify(data))
  }
  return { bytes, blobSha, calls, tree, request }
}

describe('skill safety sources', () => {
  it('native inventory receives the exact current caller rather than an ambient session', async () => {
    const h = await fixture(), seen: unknown[] = []
    const sources = new SkillSafetySources({ ...h.options, native: { ...h.options.native, inventory: async actor => { seen.push(actor); return h.installed } } })
    await sources.findSkillSources(h.actor, rid('actor-inventory'), 'pdf', h.signal)
    expect(seen).toEqual([h.actor])
  })
  it('same_name_keeps_both_tools', async () => {
    const h = await fixture(), sources = new SkillSafetySources(h.options)
    const result = await sources.findSkillSources(h.actor, rid('find-pdf'), 'pdf', h.signal)
    expect(result.status).toBe('matches')
    expect(result.candidates.map(row => row.sourceLabel)).toEqual(['claude_code', 'deepseek_harness'])
    expect(new Set(result.candidates.map(row => row.candidateId)).size).toBe(2)
    expect(h.requests).toEqual([])
  })

  it('incomplete_inventory_does_not_search_online', async () => {
    const h = await fixture()
    h.installed.complete = false
    h.installed.instances = []
    const result = await new SkillSafetySources(h.options).findSkillSources(h.actor, rid('find-ppt'), 'ppt', h.signal)
    expect(result.status).toBe('incomplete')
    expect(h.requests).toEqual([])
  })

  it('public_search_errors_are_not_no_match', async () => {
    const h = await fixture()
    h.installed.instances = []
    const sources = new SkillSafetySources({ ...h.options, request: async () => new Response('unavailable', { status: 503 }) })
    const result = await sources.findSkillSources(h.actor, rid('find-ppt'), 'ppt', h.signal)
    expect(result.status).toBe('failed')
    expect(result.failure?.action).toBe('retry')
  })

  it('retry_reuses_actual_outcome', async () => {
    const h = await fixture(), first = new SkillSafetySources(h.options)
    const result = await first.findSkillSources(h.actor, rid('find-pdf'), 'pdf', h.signal)
    h.installed.instances = []
    const retry = await new SkillSafetySources(h.options).findSkillSources(h.actor, rid('find-pdf'), 'pdf', h.signal)
    expect(retry).toEqual(result)
    await expect(first.findSkillSources(h.actor, rid('find-pdf'), 'ppt', h.signal)).rejects.toMatchObject({ code: 'SKILL_SAFETY_REQUEST_CONFLICT' })
    expect(h.requests).toEqual([])
  })

  it('other_account_or_session_cannot_resolve_candidate', async () => {
    const h = await fixture(), sources = new SkillSafetySources(h.options)
    const result = await sources.findSkillSources(h.actor, rid('find-pdf'), 'pdf', h.signal)
    for (const actor of [{ ...h.actor, accountId: 'other-account' }, { ...h.actor, sessionId: SessionId('other-session') }]) {
      await expect(sources.snapshotSkillSource(actor, result.jobId, result.candidates[0]!.candidateId, h.signal)).rejects.toMatchObject({ code: 'SKILL_SAFETY_STALE_SCOPE' })
    }
  })

  it('flat_snapshot_excludes_siblings_and_disabled_instance_is_read_only', async () => {
    const h = await fixture()
    const stage = join(h.root, 'native-owned-snapshot')
    await mkdir(stage)
    const bytes = Buffer.from('---\nname: pdf\ndescription: Read PDF\n---\nRead the document.\n')
    await writeFile(join(stage, 'SKILL.md'), bytes)
    const original = join(h.root, 'installed.pdf.md'), state = join(h.root, 'enabled.json')
    await writeFile(original, bytes); await writeFile(state, '{"enabled":false}')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const sources = new SkillSafetySources({ ...h.options, native: { ...h.options.native, snapshot: async () => ({
      directory: stage, revision: h.installed.revision, instanceId: 'instance_claude', sourceDigest: 'a'.repeat(64),
      files: [{ relativePath: 'SKILL.md', sha256, byteLength: bytes.length }],
    }) } })
    const found = await sources.findSkillSources(h.actor, rid('find-pdf'), 'pdf', h.signal)
    const artifact = await sources.snapshotSkillSource(h.actor, found.jobId, found.candidates[0]!.candidateId, h.signal)
    expect(artifact.sourceKind).toBe('installed')
    const readback = await sources.readSkillArtifact(h.actor, artifact.artifactId)
    expect(readback.files.map(file => file.relativePath)).toEqual(['SKILL.md'])
    expect(await readFile(original)).toEqual(bytes)
    expect(await readFile(state, 'utf8')).toBe('{"enabled":false}')
    await writeFile(join(stage, 'SKILL.md'), 'concurrent edit')
    await expect(sources.readSkillArtifact(h.actor, artifact.artifactId)).rejects.toMatchObject({ code: 'SKILL_SAFETY_SOURCE_CHANGED' })
  })

  it('unsafe_or_oversized_source_is_rejected', async () => {
    const h = await fixture()
    const sources = new SkillSafetySources(h.options)
    for (const url of ['http://github.com/a/b', 'https://user:password@github.com/a/b', 'https://127.0.0.1/a/b', 'https://github.com/a/b/archive/main.zip', 'https://github.com/a/b/tree/main/%2e%2e/private']) {
      const result = await sources.findSkillSources(h.actor, rid('bad-' + createHash('sha256').update(url).digest('hex')), url, h.signal)
      expect(result.status).toBe('failed')
    }
    expect(h.requests).toEqual([])
  })

  it('revoked_scope_cannot_publish_late_inventory', async () => {
    const h = await fixture()
    const sources = new SkillSafetySources({ ...h.options, native: { ...h.options.native, inventory: async () => { h.revoke(); return h.installed } } })
    await expect(sources.findSkillSources(h.actor, rid('late'), 'pdf', h.signal)).rejects.toMatchObject({ code: 'SKILL_SAFETY_STALE_SCOPE' })
    expect((await readdir(h.root)).includes('installed.pdf.md')).toBe(false)
  })

  it('fixed_public_subtree_acquires_only_selected_blob_bytes', async () => {
    const h = await fixture(), upstream = githubFixture()
    const sources = new SkillSafetySources({ ...h.options, request: upstream.request })
    const result = await sources.findSkillSources(h.actor, rid('github-pdf'), 'https://github.com/example/skills/tree/main/skills/pdf', h.signal)
    expect(result.status).toBe('matches')
    expect(result.candidates.map(row => row.displayName)).toEqual(['pdf'])
    expect(result.candidates[0]!.sourceUrl).toBe('https://github.com/example/skills/tree/' + 'c'.repeat(40) + '/skills/pdf')
    const view = await sources.snapshotSkillSource(h.actor, result.jobId, result.candidates[0]!.candidateId, h.signal)
    expect(view).toMatchObject({ sourceKind: 'github', revision: 'c'.repeat(40), fileCount: 1, byteLength: upstream.bytes.length })
    const artifact = await sources.readSkillArtifact(h.actor, view.artifactId)
    expect(await readFile(join(artifact.directory, 'SKILL.md'))).toEqual(upstream.bytes)
    expect(upstream.calls.filter(path => path.includes('/git/blobs/'))).toHaveLength(1)
    await writeFile(join(artifact.directory, 'unexpected.sh'), 'do not run')
    await expect(sources.readSkillArtifact(h.actor, view.artifactId)).rejects.toMatchObject({ code: 'SKILL_SAFETY_SOURCE_CHANGED' })
  })

  it('truncated_linked_or_oversized_public_tree_cannot_be_a_clean_match', async () => {
    const h = await fixture()
    for (const kind of ['truncated', 'linked', 'oversized']) {
      const upstream = githubFixture()
      if (kind === 'truncated') upstream.tree.truncated = true
      if (kind === 'linked') upstream.tree.tree[0]!.mode = '120000'
      if (kind === 'oversized') upstream.tree.tree[0]!.size = 30 * 1024 * 1024
      const result = await new SkillSafetySources({ ...h.options, request: upstream.request }).findSkillSources(h.actor, rid('unsafe-' + kind), 'https://github.com/example/skills/tree/main/skills/pdf', h.signal)
      expect(result.status).toBe('failed')
      expect(result.candidates).toEqual([])
      expect(upstream.calls.some(path => path.includes('/git/blobs/'))).toBe(false)
    }
  })

  it('public_redirect_to_private_host_is_rejected_before_following', async () => {
    const h = await fixture()
    let calls = 0
    const request = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }) }
    const result = await new SkillSafetySources({ ...h.options, request }).findSkillSources(h.actor, rid('redirect'), 'https://github.com/example/skills', h.signal)
    expect(result.status).toBe('failed')
    expect(calls).toBe(1)
  })

  it('changed_blob_cannot_publish_an_artifact', async () => {
    const h = await fixture(), upstream = githubFixture()
    const request = async (url: URL) => url.pathname.includes('/git/blobs/') ? new Response(JSON.stringify({ sha: upstream.blobSha, size: 9, encoding: 'base64', content: Buffer.from('bad bytes').toString('base64') })) : upstream.request(url)
    const sources = new SkillSafetySources({ ...h.options, request })
    const result = await sources.findSkillSources(h.actor, rid('changed-blob'), 'https://github.com/example/skills/tree/main/skills/pdf', h.signal)
    await expect(sources.snapshotSkillSource(h.actor, result.jobId, result.candidates[0]!.candidateId, h.signal)).rejects.toMatchObject({ code: 'SKILL_SAFETY_SOURCE_CHANGED' })
    expect((await readdir(join(h.options.root, 'artifacts'))).filter(path => path.endsWith('.json'))).toHaveLength(1)
  })
})
