import { expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const source = resolve(root, '../StudyBuddy-Toonflow')
const bun = resolve(root, '.dsh-build/aigc-reviewed-build-baselines-20261015/studybuddy-aigc/bin/bun.exe')
const fixture = fileURLToPath(new URL('./fixtures/studybuddy-aigc-first-open.mjs', import.meta.url))
const execute = promisify(execFile)

it('does not request the remote model catalog before the local service can start', async () => {
  const result = await execute(bun, ['--no-env-file', fixture, 'gateway', source], { cwd: source, windowsHide: true })
  const value = JSON.parse(result.stdout.trim())
  expect(value.before).toEqual({ configured: true, requests: 0 })
  expect(value.after).toEqual({ requests: 1, models: 0 })
}, 15000)

it('makes persisted settings usable before the catalog responds and shares an in-flight refresh', async () => {
  const result = await execute(bun, ['--no-env-file', '--tsconfig-override=' + resolve(source, 'apps/web/tsconfig.json'),
    '--define', 'import.meta.env.VITE_STUDYBUDDY_EMBEDDED:"1"', fixture, 'settings', source], { cwd: source, windowsHide: true })
  const value = JSON.parse(result.stdout.trim())
  expect(value.before).toEqual({ ready: true, catalogRequests: 1,
    savedDefault: '["fixture-provider","fixture-model"]', retained: 'original' })
  expect(value.after.saveRequests).toBe(0)
  expect(value.after.catalogRequests).toBe(1)
  expect(value.after.choices).toHaveLength(1)
}, 15000)
