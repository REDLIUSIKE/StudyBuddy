/** Entering research gives its editors and native chat the full available width. */
import type { PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** Observe transitions rather than geometry, so a manual expansion remains possible. */
export function observeResearchActivation(source: HostObservable<PanelInfo>, onEnter: () => void): () => void {
  let active = false
  const update = () => {
    const next = source.getSnapshot().activePanelId === 'studybuddy.research'
    const entered = next && !active
    active = next
    if (entered) onEnter()
  }
  const stop = source.subscribe(update)
  update()
  return stop
}
