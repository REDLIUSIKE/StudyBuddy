import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
it('declares all formal package registration surfaces and no feature-plugin value imports', async () => {
  const manifest = JSON.parse(await readFile('packages/client/ui-studybuddy-tools/package.json', 'utf8')) as {
    name: string
    dsh: { client: { platform: string } }
  }
  expect(manifest.name).toBe('@deepseek-ai/dsh-client-ui-studybuddy-tools')
  expect(manifest.dsh.client.platform).toBe('web')
  for (const path of [
    'tsconfig.client.json',
    'tsconfig.host.json',
    'packages/bundle/web-app/package.json',
    'packages/bundle/web-app/cordis.patch.yml',
  ])
    expect(await readFile(path, 'utf8')).toContain('ui-studybuddy-tools')
  const source = await readFile('packages/client/ui-studybuddy-tools/src/client/index.ts', 'utf8')
  expect(source).not.toMatch(/import\s+\{[^}]+\}\s+from\s+['"]@deepseek-ai\/dsh-client-ui-studybuddy-account/)
  expect(source).toContain('slots.inject')
})
