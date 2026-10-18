/** Remount-surviving form drafts; authoritative results stay in SupportController. */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { SupportLogRange } from '@studybuddy/contracts'
interface Draft { mode: 'logs' | 'issue'; range: SupportLogRange; title: string; description: string }
/** Declare support form fields and their complete mutation API. @returns One registration store definition. */
export function createSupportViewStore() {
  return defineStore({
    init: (): Draft => ({ mode: 'logs', range: 'last_24_hours', title: '', description: '' }),
    actions: {
      setMode: (d: Draft, mode: Draft['mode']) => { d.mode = mode },
      setRange: (d: Draft, range: SupportLogRange) => { d.range = range },
      setTitle: (d: Draft, title: string) => { d.title = title },
      setDescription: (d: Draft, description: string) => { d.description = description },
      reset: (d: Draft) => { Object.assign(d, { mode: 'logs', range: 'last_24_hours', title: '', description: '' }) },
    },
  })
}
