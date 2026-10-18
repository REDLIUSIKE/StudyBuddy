import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import * as resources from '../src/studybuddy/research-resource-identity.ts'

const productionPin = { manifestSha256: '1'.repeat(64), sourceCommit: '2'.repeat(40), sourceDigest: '3'.repeat(64), lockDigest: '4'.repeat(64) }
const developmentPin = { manifestSha256: '5'.repeat(64), sourceCommit: '2'.repeat(40), sourceDigest: '3'.repeat(64), lockDigest: '4'.repeat(64) }
const workspace = join(tmpdir(), 'research-resource-owner')
const options = { appDirectory: join(workspace, 'apps/desktop'), resourcesDirectory: join(workspace, 'installed/resources'), productionPin, developmentPin }

it('uses the independent development resource and pin even when a production resource has been prepared', () => {
  expect(resources.resolveResearchResourceLocation({ ...options, packaged: false })).toEqual({
    directory: resolve(workspace, '.dsh-build/studybuddy-research-development'), pin: developmentPin,
  })
})

it('loads packaged research only from its installed resource and production pin', () => {
  expect(resources.resolveResearchResourceLocation({ ...options, packaged: true })).toEqual({
    directory: join(workspace, 'installed/resources/studybuddy-research'), pin: productionPin,
  })
})

it('does not substitute the production pin when the development resource has not been prepared', async () => {
  const selected = resources.resolveResearchResourceLocation({ ...options, packaged: false, developmentPin: null })
  expect(selected.pin).toBeNull()
  await expect(resources.loadResearchResources(selected.directory, {
    primaryRuntimeDirectory: join(workspace, 'primary'), dshDirectory: join(workspace, 'dsh'),
  }, selected.pin)).rejects.toThrow('RESEARCH_RESOURCE_NOT_PREPARED')
})
