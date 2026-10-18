// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { AigcConversation, AigcWelcome } from '../src/client/native-conversation.tsx'
import { zh } from '../src/client/locales.ts'
afterEach(cleanup)
it('retains the original three welcome suggestions and only fills the native draft', () => {
  const setDraft = vi.fn(), persistDraft = vi.fn(), submit = vi.fn(), focusInput = vi.fn()
  render(createElement(AigcWelcome, {
    sessionId: 'session-a', t: (key: keyof typeof zh) => zh[key], focusInput,
    useInput: (select: (state: { phase: string }) => unknown) => select({ phase: 'plain' }),
    inputActions: { setDraft, persistDraft, submit },
  } as never))
  expect(screen.getByText('你好，我是 StudyBuddy 创作助手')).toBeTruthy()
  for (const label of ['搭建创作画布', '梳理故事分镜', '生成图片素材']) fireEvent.click(screen.getByRole('button', { name: `填入提示：${label}` }))
  expect(setDraft.mock.calls.map(([text]) => text)).toEqual([
    '帮我搭建一个创作画布，先和我确认需要的节点与流程。',
    '帮我把故事整理成分镜，先和我确认故事内容、时长和画面风格。',
    '帮我生成图片素材，先和我确认画面内容、风格和使用的模型。',
  ])
  expect(focusInput).toHaveBeenCalledWith('session-a')
  expect(persistDraft).toHaveBeenCalledTimes(3)
  expect(submit).not.toHaveBeenCalled()
})
it('shows the welcome card only for an open, unused native conversation', () => {
  const renderSlot = vi.fn(() => <p>Welcome</p>), state = { openState: 'open', blank: true, running: false, promptAttempted: false }
  const props = { useSession: (select: (value: typeof state) => unknown) => select(state), renderSlot, renderFactorySlot: () => <div>Native content</div> }
  const view = render(createElement(AigcConversation, props as never))
  expect(renderSlot).toHaveBeenCalledWith('studybuddy.aigc.welcome', {})
  renderSlot.mockClear(); state.promptAttempted = true
  view.rerender(createElement(AigcConversation, props as never))
  expect(renderSlot).not.toHaveBeenCalled()
})
