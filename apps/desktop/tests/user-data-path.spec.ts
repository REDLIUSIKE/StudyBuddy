import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { resolveDesktopUserDataPath } from '../src/paths.ts'

describe('development desktop data ownership', () => {
  const appData = resolve('fixture-account', 'Roaming')
  const candidate = resolve('fixture-workspace', '验收 空间', 'electron-user-data')

  it('keeps the requested development profile separate from an already running client', () => {
    expect(resolveDesktopUserDataPath(appData, false, candidate)).toBe(candidate)
    expect(resolveDesktopUserDataPath(appData, false, candidate)).not.toBe(join(appData, 'StudyBuddy-Harness'))
  })

  it('preserves the established profile when no development override is supplied', () => {
    expect(resolveDesktopUserDataPath(appData, false, '')).toBe(join(appData, 'StudyBuddy-Harness'))
  })

  it('preserves the installed profile even if a development argument is supplied', () => {
    expect(resolveDesktopUserDataPath(appData, true, candidate)).toBe(join(appData, 'StudyBuddy-Harness'))
  })
})
