import { expect, it } from 'vitest'
import { selectAigcNativeFiles } from './prepare-aigc-native-runtime.mjs'
it('keeps native runtime and licenses while excluding old interpreters, old chat and development payloads', () => {
  const required = ['server/domain.js', 'server/toolZod.js', 'server/image-resize-worker.js', 'server/package.json', 'server/domainClosure.json', 'web/index.html', 'node_modules/zod/package.json', 'notices/ffmpegLicense.txt', 'notices/ffmpegReadme.txt']
  const runtime = ['node_modules/zod/v4/index.cjs', 'node_modules/zod/LICENSE', 'notices/piToolHelpersLicense.txt', 'nodes/director3d.umd.js']
  const rejected = ['server/index.js', 'server/studyBuddy.js', 'bin/bun.exe', 'mcp/index.js', 'providers/old.ts', 'node_modules/zod/src/index.ts', 'node_modules/zod/v4/index.d.ts', 'web/assets/page.js.map']
  const rows = [...required, ...runtime, ...rejected].map(path => ({ path, size: 1, sha256: 'a'.repeat(64) }))
  expect(selectAigcNativeFiles(rows, ['zod']).map(row => row.path)).toEqual([...required, ...runtime])
  expect(() => selectAigcNativeFiles(rows.filter(row => row.path !== 'server/image-resize-worker.js'), ['zod'])).toThrow('AIGC_BUILD_CLOSURE_MISSING')
  expect(() => selectAigcNativeFiles(rows, ['../foreign'])).toThrow('AIGC_BUILD_CLOSURE_INVALID')
})
