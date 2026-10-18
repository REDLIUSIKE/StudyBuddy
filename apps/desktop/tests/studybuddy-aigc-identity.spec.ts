import { it, expect } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAigcResources } from '../src/studybuddy/aigc-resource-identity.ts'
it('refuses a rewritten resource inventory even if its file digests are self-consistent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-manifest-'))
  try {
    const value = JSON.parse(await readFile('.dsh-build/studybuddy-aigc/manifest.json', 'utf8'))
    value.sourceCommit = 'a'.repeat(40)
    await writeFile(join(root, 'manifest.json'), JSON.stringify(value, null, 2) + '\n')
    await expect(loadAigcResources(root)).rejects.toThrow('AIGC_RUNTIME_IDENTITY_MISMATCH')
  } finally { await rm(root, { force: true, recursive: true }) }
})
