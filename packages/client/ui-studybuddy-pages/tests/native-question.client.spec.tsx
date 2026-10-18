// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AigcConversations, AigcQuestion } from '../src/client/native-conversation.tsx'
afterEach(cleanup)
const t = (key: string) => key === 'nativeQuestion' ? '创作助手提问' : key
const snapshot = {
  geometry: { visible: true, bounds: { x: 600, y: 100, width: 420, height: 600 } }, references: [],
  views: [{ projectId: 'project', workspaceId: 'workspace', sessionId: 'session-a', reference: {}, selected: true }],
  interactionId: 'interaction', interactionSessionId: 'session-a',
}
it('keeps a visible project question in the existing native conversation rectangle', () => {
  const renderSlot = vi.fn(() => <div>Native question</div>)
  const view = render(createElement(AigcConversations, {
    useAigcViews: (select: (value: typeof snapshot) => unknown) => select(snapshot),
    usePanelInfo: (select: (value: { activePanelId: string }) => unknown) => select({ activePanelId: 'studybuddy.aigc' }),
    SessionProvider: ({ children }: { children: ReactNode }) => children, renderSlot, t,
  } as never))
  expect(renderSlot).toHaveBeenCalledWith('studybuddy.aigc.question', { interactionId: 'interaction', presentation: 'inline' })
  expect((view.container.firstElementChild as HTMLElement).style.cssText).toBe('left: 600px; top: 100px; width: 420px; height: 600px;')
})
it.each(['inline', 'floating'] as const)('uses native question content without a modal or another title card in %s presentation', async presentation => {
  const readyInteraction = vi.fn(async () => undefined), dismissInteraction = vi.fn(async () => undefined)
  const renderFactorySlot = vi.fn(() => <section aria-label="Native question card">Native choices</section>)
  render(createElement(AigcQuestion, {
    presentation, interactionId: 'interaction', useSession: (select: (value: { openState: string }) => unknown) => select({ openState: 'open' }),
    readyInteraction, dismissInteraction, renderFactorySlot, t,
  } as never))
  expect(screen.queryByRole('heading', { name: '创作助手提问' })).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByLabelText('Native question card')).toBeTruthy()
  expect(renderFactorySlot).toHaveBeenCalledWith('conversation.content', expect.objectContaining({ variant: 'embedded', hero: false }), presentation === 'inline' ? undefined : expect.any(Object))
  expect(readyInteraction).toHaveBeenCalledWith('interaction')
})
