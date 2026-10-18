import { expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, unlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { resolveToolResource } from '../src/studybuddy/tool-center-resources.ts'
it('serves only registered module bytes and refuses traversal, links and tampering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studybuddy-module-'))
  try {
    const bytes = '<html>fixture</html>',
      hash = createHash('sha256').update(bytes).digest('hex')
    await writeFile(join(root, 'index.html'), bytes)
    const manifest = { moduleId: 'sha256:' + hash, entry: 'index.html' as const, files: { 'index.html': hash } }
    expect(await resolveToolResource('dsh-tools://tool-center/index.html', root, manifest)).toMatchObject({
      path: join(root, 'index.html'),
      mime: 'text/html',
    })
    for (const path of [
      '../index.html',
      '%2e%2e/index.html',
      'assets/../../index.html',
      '%5cindex.html',
      'unknown.js',
      'index.html?url=https://evil.example',
    ])
      await expect(resolveToolResource('dsh-tools://tool-center/' + path, root, manifest)).rejects.toThrow(
        'TOOL_RESOURCE_DENIED',
      )
    await expect(resolveToolResource('https://tool-center/index.html', root, manifest)).rejects.toThrow()
    await writeFile(join(root, 'index.html'), 'changed')
    await expect(resolveToolResource('dsh-tools://tool-center/index.html', root, manifest)).rejects.toThrow()
    await mkdir(join(root, 'real'))
    await writeFile(join(root, 'real', 'index.html'), bytes)
    await symlink(join(root, 'real'), join(root, 'alias'), 'junction')
    await expect(
      resolveToolResource('dsh-tools://tool-center/alias/index.html', root, {
        ...manifest,
        files: { ...manifest.files, 'alias/index.html': hash },
      }),
    ).rejects.toThrow()
  } finally {
    await unlink(join(root, 'alias')).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
    await rm(root, { recursive: true, force: true })
  }
})
