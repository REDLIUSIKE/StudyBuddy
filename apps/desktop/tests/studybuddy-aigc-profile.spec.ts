import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { prepareAigcProfile } from '../src/studybuddy/aigc-profile.ts'

it('seals the AIGC-only dsh profile without modifying projects or admitting environment injection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-profile-seal-'))
  const resources = { directory: join(root, 'resources'), node: join(root, 'shared/node.exe'), entry: join(root, 'shared/dsh.js'),
    plugin: join(root, 'shared/aigc-plugin.js'), domainEntry: join(root, 'resources/server/domain.js'), staticDirectory: join(root, 'resources/web'), manifestSha256: 'a'.repeat(64) }
  try {
    await mkdir(join(root, 'workspaces')); await writeFile(join(root, 'workspaces/story.json'), 'original')
    const home = await prepareAigcProfile(root, resources), profile = join(home, 'profiles/studybuddy-aigc')
    expect(JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')).dsh.profile.bundles).toEqual([])
    expect(JSON.parse(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'))).toEqual([{ insert: [{ id: 'studybuddy-aigc', name: pathToFileURL(resources.plugin).href,
      config: { domainEntry: resources.domainEntry, resourceDirectory: resources.directory, staticDirectory: resources.staticDirectory } }] }])
    expect(await prepareAigcProfile(root, resources)).toBe(home)
    expect(await readFile(join(root, 'workspaces/story.json'), 'utf8')).toBe('original')
    await writeFile(join(home, '.env'), 'INJECTED=1')
    await expect(prepareAigcProfile(root, resources)).rejects.toThrow('AIGC_PROFILE_INVALID')
  } finally { await rm(root, { recursive: true, force: true }) }
})
