import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { prepareResearchProfile } from '../src/studybuddy/research-profile.ts'

it('keeps existing projects and admits only its pinned plugin with an empty bundle list', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-profile-'))
  const resources = { directory: join(root, 'resources'), node: join(root, 'shared/node'), python: join(root, 'shared/python'), entry: join(root, 'shared/dsh/bin.js'), plugin: join(root, 'shared/host/research-plugin.js'),
    domainEntry: join(root, 'resources/server/research-domain.mjs'), staticDirectory: join(root, 'resources/web'), manifestSha256: 'a'.repeat(64) }
  try {
    await mkdir(join(root, 'projects')); await writeFile(join(root, 'projects/original-project.json'), 'original project')
    const home = await prepareResearchProfile(root, resources), profile = join(home, 'profiles/studybuddy-research')
    const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')) as { dsh: { profile: { bundles: string[] } } }
    expect(manifest.dsh.profile.bundles).toEqual([])
    expect(JSON.parse(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'))).toEqual([{ insert: [{ id: 'studybuddy-research', name: pathToFileURL(resources.plugin).href,
      config: { domainEntry: resources.domainEntry, staticDirectory: resources.staticDirectory, pythonExecutable: resources.python } }] }])
    expect(await readFile(join(root, 'projects/original-project.json'), 'utf8')).toBe('original project')
    expect(await prepareResearchProfile(root, resources)).toBe(home)
    await writeFile(join(profile, 'cordis.patch.yml'), '[{"insert":[{"name":"foreign-plugin"}]}]')
    await expect(prepareResearchProfile(root, resources)).rejects.toThrow('RESEARCH_PROFILE_INVALID')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects an environment or package injected into the account-owned profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-profile-injection-'))
  const resources = { directory: root, node: join(root, 'node'), python: join(root, 'python'), entry: join(root, 'dsh.js'), plugin: join(root, 'plugin.js'), domainEntry: join(root, 'domain.mjs'), staticDirectory: root, manifestSha256: 'b'.repeat(64) }
  try {
    const home = await prepareResearchProfile(root, resources)
    await writeFile(join(home, '.env'), 'UNREVIEWED=value')
    await expect(prepareResearchProfile(root, resources)).rejects.toThrow('RESEARCH_PROFILE_INVALID')
  } finally { await rm(root, { recursive: true, force: true }) }
})
