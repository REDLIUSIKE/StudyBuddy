import { expect, it } from 'vitest'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
it('ships the sandboxed Skill preload and its separate verified runtime in the Windows package', () => {
  const config: unknown = createElectronBuilderConfig({
    DSH_DESKTOP_APP_ID: 'com.example.skill-integration', DSH_DESKTOP_TARGET_PLATFORM: 'win32', DSH_DESKTOP_TARGET_ARCH: 'x64',
    DSH_DESKTOP_UNSIGNED: '1', DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
    DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
  }, 'win32', 'x64')
  if (!config || typeof config !== 'object' || !('files' in config) || !('extraResources' in config) || !Array.isArray(config.extraResources)) throw Error('INVALID_BUILDER_CONFIG')
  expect(config.files).toContain('lib/preload-studybuddy-skills.cjs')
  expect(config.files).toContain('lib/preload-studybuddy-research.cjs')
  const resources: unknown[] = config.extraResources
  const resource = resources.find(row => row && typeof row === 'object' && 'to' in row && row.to === 'studybuddy-skills-native')
  if (!resource || typeof resource !== 'object' || !('from' in resource) || typeof resource.from !== 'string') throw Error('SKILL_RESOURCE_MISSING')
  expect(resource.from.replaceAll('\\', '/')).toMatch(/\/\.dsh-build\/studybuddy-skills-native\/?$/)
  for (const name of ['studybuddy-business', 'studybuddy-aigc', 'studybuddy-research', 'studybuddy-video']) {
    const embedded = resources.find(row => row && typeof row === 'object' && 'to' in row && row.to === name)
    if (!embedded || typeof embedded !== 'object' || !('from' in embedded) || typeof embedded.from !== 'string') throw Error(`${name} must be shipped, not only usable in development`)
    expect(embedded.from.replaceAll('\\', '/')).toMatch(new RegExp(`/\\.dsh-build/${name}$`))
  }
  const videoModules = resources.find(row => row && typeof row === 'object' && 'to' in row && row.to === 'studybuddy-video/node_modules')
  expect(videoModules).toMatchObject({ filter: ['**/*'] })
}, 15000)
