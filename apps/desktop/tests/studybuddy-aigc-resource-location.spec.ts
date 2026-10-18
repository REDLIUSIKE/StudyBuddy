import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import * as resources from '../src/studybuddy/aigc-native-resources.ts'

const productionPin = { manifestSha256: '1'.repeat(64), sourceCommit: '2'.repeat(40), sourceDigest: '3'.repeat(64), lockDigest: '4'.repeat(64) }
const developmentPin = { ...productionPin, manifestSha256: '5'.repeat(64) }
const workspace = join(tmpdir(), 'aigc-resource-owner')
const options = { appDirectory: join(workspace, 'apps/desktop'), resourcesDirectory: join(workspace, 'installed/resources'), productionPin, developmentPin }

it('selects the independently prepared AIGC development resource and its matching pin', () => {
  expect(resources.resolveAigcResourceLocation).toBeTypeOf('function')
  expect(resources.resolveAigcResourceLocation({ ...options, packaged: false })).toEqual({
    directory: resolve(workspace, '.dsh-build/studybuddy-aigc-development'), pin: developmentPin,
  })
})

it('loads installed AIGC exclusively from the installed resource and production pin', () => {
  expect(resources.resolveAigcResourceLocation).toBeTypeOf('function')
  expect(resources.resolveAigcResourceLocation({ ...options, packaged: true })).toEqual({
    directory: join(workspace, 'installed/resources/studybuddy-aigc'), pin: productionPin,
  })
})

it('keeps an unprepared development identity null rather than using the production identity', () => {
  expect(resources.resolveAigcResourceLocation).toBeTypeOf('function')
  expect(resources.resolveAigcResourceLocation({ ...options, packaged: false, developmentPin: null })).toEqual({
    directory: resolve(workspace, '.dsh-build/studybuddy-aigc-development'), pin: null,
  })
})
