import { describe, expect, it } from 'vitest'
import { GlobalRightPanel } from '../src/client/global-panel.ts'

describe('global right panel', () => {
  it('opens on any main page and ignores retained Session close reports', () => {
    const reports: unknown[] = []
    const owner = new GlobalRightPanel({ openRightbar: (...args) => { reports.push(args) }, closeRightbar: () => { reports.push('closed') } })
    owner.open('prompts')
    owner.reportSession({ shown: false, track: false, fullscreen: false })
    expect(owner.source.getSnapshot()).toBe('prompts')
    expect(reports).toEqual([[true, false]])
  })
  it('restores current Session presentation when closed without selecting any main route', () => {
    const reports: unknown[] = []
    const owner = new GlobalRightPanel({ openRightbar: (...args) => { reports.push(args) }, closeRightbar: () => { reports.push('closed') } })
    owner.reportSession({ shown: true, track: true, fullscreen: false })
    owner.open('prompts')
    owner.close()
    expect(owner.source.getSnapshot()).toBeNull()
    expect(reports).toEqual([[true, false], [true, false], [true, false]])
    owner.reportSession({ shown: false, track: false, fullscreen: false })
    expect(reports.at(-1)).toBe('closed')
  })
})
