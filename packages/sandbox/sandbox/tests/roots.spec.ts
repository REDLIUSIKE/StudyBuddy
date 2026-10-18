/**
 * Tests for the writable-root derivation: the mode's meaning as a canonical
 * allow-list. Pinned here so the fs fence and the Seatbelt profile — both
 * deriving from `writableRoots` — cannot drift.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, rmdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalPath, writableRoots } from '@deepseek-ai/dsh-sandbox'

/** Every temp root created by this file, removed after each test. */
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('canonicalPath', () => {
  it('resolves symlinks (an existing path realpaths)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-roots-'))
    roots.push(dir)
    expect(canonicalPath(dir)).toBe(realpathSync.native(dir))
  })

  it('returns the spelling as-is when the path cannot be resolved (conservative — matches nothing until it exists)', () => {
    expect(canonicalPath('/does/not/exist/anywhere-xyz')).toBe('/does/not/exist/anywhere-xyz')
  })
})

describe('writableRoots', () => {
  it('grants exactly selected additional roots without changing read-only semantics', () => {
    const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-extra-root-')))
    roots.push(base)
    const main = join(base, 'main')
    const extra = join(base, 'extra')
    mkdirSync(main)
    mkdirSync(extra)
    const policy = { workspaceRoot: main, additionalWorkspaceRoots: [extra, main] }
    const allowed = writableRoots({ ...policy, mode: 'workspace-write' })
    expect(allowed).toContain(extra)
    expect(allowed.filter(root => root === main)).toHaveLength(1)
    expect(allowed).not.toContain('/unrelated')
    expect(writableRoots({ ...policy, mode: 'read-only' })).toEqual([])
  })
  it('refuses a captured source replaced by a junction instead of granting its new target', () => {
    const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-source-swap-')))
    roots.push(base)
    const main = join(base, 'main'), extra = join(base, 'extra'), outside = join(base, 'outside')
    for (const path of [main, extra, outside]) mkdirSync(path)
    rmdirSync(extra)
    symlinkSync(outside, extra, process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => writableRoots({ mode: 'workspace-write', workspaceRoot: main, additionalWorkspaceRoots: [extra] }))
      .toThrow('source')
  })
  it('read-only grants nothing', () => {
    expect(writableRoots({ mode: 'read-only', workspaceRoot: process.cwd() })).toEqual([])
  })

  it('workspace-write grants the workspace root plus the platform temp areas, canonical and deduplicated', () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-ws-'))
    roots.push(ws)
    const writable = writableRoots({ mode: 'workspace-write', workspaceRoot: ws })
    expect(writable).toContain(realpathSync.native(ws))
    expect(writable).toContain(canonicalPath('/tmp'))
    expect(writable).toContain(realpathSync.native(tmpdir()))
    // Deduplicated after canonicalization (/tmp and os.tmpdir() may coincide).
    expect(new Set(writable).size).toBe(writable.length)
  })
})
