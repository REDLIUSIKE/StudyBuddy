import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, stat, rm } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { expect, it } from 'vitest'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
const require = createRequire(import.meta.url)
const { getNodeModuleFileMatcher } = require('app-builder-lib/out/fileMatcher.js') as {
  getNodeModuleFileMatcher: (app: string, output: string, expand: (value: string) => string, platform: object, packager: object) => {
    isEmpty: () => boolean
    createFilter: () => (path: string, info: Stats) => boolean
  }
}

it('omits private contract source/test fixtures while retaining compiled contracts and other runtime modules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studybuddy-production-files-'))
  try {
    const config = createElectronBuilderConfig({ DSH_DESKTOP_APP_ID: 'com.studybuddy.desktop', DSH_DESKTOP_UNSIGNED: '1',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }) }, 'win32', 'x64')
    const matcher = getNodeModuleFileMatcher(root, join(root, 'output'), value => value, {},
      { config, debugLogger: { isEnabled: false } })
    const filter = matcher.isEmpty() ? () => true : matcher.createFilter()
    for (const [name, included] of [
      ['node_modules/@studybuddy/contracts/dist/index.js', true],
      ['node_modules/@studybuddy/contracts/src/auth-lifecycle.test.ts', false],
      ['node_modules/@studybuddy/contracts/source-manifest.json', false],
      ['node_modules/ws/lib/websocket.js', true],
    ] as const) {
      const path = join(root, name)
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, 'inert fixture')
      expect(filter(path, await stat(path)), name).toBe(included)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
