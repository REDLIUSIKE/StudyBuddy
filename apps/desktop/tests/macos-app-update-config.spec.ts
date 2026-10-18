import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createMacOSAppUpdateConfig,
  resolveMacOSAppUpdateFeed,
  verifyMacOSAppUpdateConfig,
  writeMacOSAppUpdateConfig,
} from '../scripts/macos-app-update-config.mjs'

const roots: string[] = []
const update = { publicUrl: 'https://desktop-updates.example.com/dsh-desk/feeds/mac-arm64/', channel: 'latest' as const }

async function fixture(): Promise<{ appPath: string; resourcesDir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-macos-update-config-'))
  roots.push(root)
  const appPath = join(root, 'StudyBuddy.app')
  const resourcesDir = join(appPath, 'Contents', 'Resources')
  await mkdir(resourcesDir, { recursive: true })
  return { appPath, resourcesDir }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('macOS packaged updater configuration', () => {
  it('uses the final generic stable provider configured for the build', () => {
    expect(resolveMacOSAppUpdateFeed([{ provider: 'generic', url: update.publicUrl, channel: 'latest' }]))
      .toEqual(update)
    for (const publish of [undefined, [], [{ provider: 'github', channel: 'latest', url: update.publicUrl }],
      [{ provider: 'generic', channel: 'beta', url: update.publicUrl }]]) {
      expect(() => resolveMacOSAppUpdateFeed(publish)).toThrow(/macOS update config/u)
    }
  })

  it('writes and verifies the fixed release feed before signing', async () => {
    const paths = await fixture()
    expect(createMacOSAppUpdateConfig(update, 'studybuddy-updater')).toEqual({
      provider: 'generic',
      url: update.publicUrl,
      channel: 'latest',
      updaterCacheDirName: 'studybuddy-updater',
    })
    await writeMacOSAppUpdateConfig(paths.resourcesDir, update, 'studybuddy-updater')
    await expect(verifyMacOSAppUpdateConfig(paths.appPath, update, 'studybuddy-updater')).resolves.toBeUndefined()
  })

  it.each([
    ['missing', undefined],
    ['wrong feed', 'provider: generic\nurl: https://wrong.example.com/\nchannel: latest\nupdaterCacheDirName: fixture\n'],
    ['missing cache directory', `provider: generic\nurl: ${update.publicUrl}\nchannel: latest\n`],
  ] as const)('rejects %s updater configuration', async (_label, contents) => {
    const paths = await fixture()
    if (contents !== undefined) await writeFile(join(paths.resourcesDir, 'app-update.yml'), contents)
    await expect(verifyMacOSAppUpdateConfig(paths.appPath, update)).rejects.toThrow(/macOS update config/u)
  })

  it('rejects another updater cache directory when the signed value is known', async () => {
    const paths = await fixture()
    await writeMacOSAppUpdateConfig(paths.resourcesDir, update, 'wrong-updater')
    await expect(verifyMacOSAppUpdateConfig(paths.appPath, update, 'studybuddy-updater'))
      .rejects.toThrow(/expected studybuddy-updater/u)
  })
})
