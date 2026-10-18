import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const { hash }: { hash(value: string): bigint } = await import(new URL('../../integrations/toonflow/apps/server/src/embedded/hash.ts', import.meta.url).href)

it('preserves Bun 1.3.14 revisions across short, unicode and multi-block plugin sources', () => {
  const samples = ['', 'a', 'abc', 'some data here', '中文模型🙂', '0123456789'.repeat(5), 'a'.repeat(48), 'b'.repeat(49), 'extension'.repeat(100)]
  const executable = fileURLToPath(new URL('../../.dsh-build/aigc-reviewed-build-baselines-20261015/studybuddy-aigc/bin/bun.exe', import.meta.url))
  const expected = JSON.parse(execFileSync(executable, ['-e', `console.log(JSON.stringify(${JSON.stringify(samples)}.map(value=>Bun.hash(value).toString(16))))`], { encoding: 'utf8', windowsHide: true }))
  expect(samples.map(value => hash(value).toString(16))).toEqual(expected)
  expect(hash('some data here')).toBe(11562320457524636935n)
})
