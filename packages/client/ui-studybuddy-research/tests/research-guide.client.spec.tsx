// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { ComponentProps } from 'react'
import { ResearchConversations } from '../src/client/native-conversation.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

function fixture() {
  let selected = false, active = true, account = 'first', error = false, busy = false
  const props = {
    useViews: () => ({ views: [{ projectId: 'study', sessionId: 'session-a', reference: {}, selected, intents: [] }], ...(error ? { selectionError: { projectId: 'study' } } : {}) }),
    useGeometry: () => ({ bounds: { x: 800, y: 40, width: 480, height: 780 }, visible: true }),
    usePanelInfo: () => active,
    usePage: () => ({ scope: { accountId: account, generation: 1 }, busy, errorCode: undefined }),
    SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    renderSlot: () => <textarea aria-label="Native draft" defaultValue="saved draft" />,
    applyIntent: async () => {},
    t: (key: keyof typeof zh) => zh[key],
  } as ComponentProps<typeof ResearchConversations>
  const view = render(<ResearchConversations {...props} />)
  return {
    set: (changes: { selected?: boolean; active?: boolean; account?: string; error?: boolean; busy?: boolean }) => {
      selected = changes.selected ?? selected; active = changes.active ?? active
      account = changes.account ?? account; error = changes.error ?? error; busy = changes.busy ?? busy
      view.rerender(<ResearchConversations {...props} />)
    },
  }
}

it('navigates the guide through bounded pages and jumps through its chapter menu', () => {
  fixture()
  expect(screen.getByRole('heading', { name: '认识研究工作台' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '上一页' })).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  expect(screen.getByRole('heading', { name: '项目、资料与成果' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '目录' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '更多能力' }))
  expect(screen.getByRole('heading', { name: '更多能力' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '下一页' })).toHaveProperty('disabled', true)
})

it('retains the chapter on ordinary panel switches and resets it for a different account', () => {
  const view = fixture()
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  view.set({ active: false }); view.set({ active: true })
  expect(screen.getByRole('heading', { name: '项目、资料与成果' })).toBeTruthy()
  view.set({ account: 'second' })
  expect(screen.getByRole('heading', { name: '认识研究工作台' })).toBeTruthy()
})

it('keeps the native draft mounted when returning from a project to its guide', () => {
  const view = fixture()
  view.set({ selected: true })
  const draft = screen.getByRole('textbox', { name: 'Native draft' })
  fireEvent.change(draft, { target: { value: 'unsubmitted research draft' } })
  view.set({ selected: false })
  expect(screen.getByRole('heading', { name: '认识研究工作台' })).toBeTruthy()
  view.set({ selected: true })
  expect(screen.getByRole('textbox', { name: 'Native draft' })).toBe(draft)
  expect(draft).toHaveProperty('value', 'unsubmitted research draft')
})

it('keeps a failed native project selection visible instead of replacing it with the guide', () => {
  const view = fixture()
  view.set({ error: true })
  expect(screen.getByRole('alert').textContent).toContain('原生研究会话暂未就绪')
  expect(screen.queryByRole('heading', { name: '认识研究工作台' })).toBeNull()
})

it('handles chapter arrow keys only within the guide', () => {
  fixture()
  fireEvent.keyDown(document.body, { key: 'ArrowRight' })
  expect(screen.getByRole('heading', { name: '认识研究工作台' })).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('region', { name: '使用指南' }), { key: 'ArrowRight' })
  expect(screen.getByRole('heading', { name: '项目、资料与成果' })).toBeTruthy()
})

it('shows the public guide while the local workbench prepares its first document', () => {
  const view = fixture()
  view.set({ busy: true })
  expect(screen.getByRole('heading', { name: '认识研究工作台' })).toBeTruthy()
  view.set({ busy: false, selected: true })
  expect(screen.queryByRole('heading', { name: '认识研究工作台' })).toBeNull()
  expect(screen.getByRole('textbox', { name: 'Native draft' })).toBeTruthy()
})

it('connects a visible picture marker to its explanation without starting a research action', async () => {
  fixture()
  expect(await screen.findByRole('img', { name: '认识研究工作台' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '位置 2：研究流程' }))
  expect(screen.getByRole('button', { name: '位置 2：研究流程' })).toHaveProperty('ariaPressed', 'true')
  expect(screen.getByRole('region', { name: '图中说明' }).textContent).toContain('研究流程')
})

it('opens a readable figure and withdraws its portal when the retained guide is hidden', async () => {
  const view = fixture()
  await screen.findByRole('img', { name: '认识研究工作台' })
  fireEvent.click(screen.getByRole('button', { name: '放大图片' }))
  expect(screen.getByRole('dialog', { name: '认识研究工作台' })).toBeTruthy()
  view.set({ active: false })
  expect(screen.queryByRole('dialog')).toBeNull()
  view.set({ active: true })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('img', { name: '认识研究工作台' })).toBeTruthy()
})
