import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId, PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import { expect, it, vi } from 'vitest'
import { observeResearchActivation } from '../src/client/research-navigation.ts'

it('collapses only when entering research, allowing manual expansion within the page', () => {
  const panel = createSnapshotStore<PanelInfo>({ activePanelId: null })
  const enter = vi.fn()
  const stop = observeResearchActivation(panel, enter)
  panel.set({ activePanelId: 'studybuddy.research' as MainPanelId })
  panel.set({ activePanelId: 'studybuddy.research' as MainPanelId })
  expect(enter).toHaveBeenCalledTimes(1)
  panel.set({ activePanelId: 'studybuddy.tools' as MainPanelId })
  panel.set({ activePanelId: 'studybuddy.research' as MainPanelId })
  expect(enter).toHaveBeenCalledTimes(2)
  stop()
  panel.set({ activePanelId: null })
  panel.set({ activePanelId: 'studybuddy.research' as MainPanelId })
  expect(enter).toHaveBeenCalledTimes(2)
})

it('handles an initially active page and a synchronous layout notification without reentry', () => {
  const panel = createSnapshotStore<PanelInfo>({ activePanelId: 'studybuddy.research' as MainPanelId })
  const enter = vi.fn(() => panel.set({ activePanelId: 'studybuddy.research' as MainPanelId }))
  const stop = observeResearchActivation(panel, enter)
  expect(enter).toHaveBeenCalledTimes(1)
  stop()
})
