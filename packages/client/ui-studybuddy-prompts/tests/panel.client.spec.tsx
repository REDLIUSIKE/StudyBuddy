// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PromptCard, PromptFeedback, PromptPanel, type PromptPanelProps } from '../src/client/PromptPanel.tsx'
import { createPromptViewStore } from '../src/client/view-store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
const row = { id: 'p', title: '项目规则', body: '第一行\n\n  第二行  ', revision: 1, owned: true, sourceId: 'p', createdAt: '', updatedAt: '' }
const t = (key: keyof typeof zh) => zh[key]
it('copies full text while edit and publication are independent accessible actions', async () => {
  const copy = vi.fn(async () => {}), edit = vi.fn(), publish = vi.fn()
  render(<PromptCard row={row} copy={copy} edit={edit} publish={publish} busy={false} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑提示词' }))
  fireEvent.click(screen.getByRole('button', { name: '上传到提示词广场' }))
  expect(copy).not.toHaveBeenCalled()
  expect(edit).toHaveBeenCalledOnce(); expect(publish).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '项目规则' }))
  await waitFor(() => { expect(copy).toHaveBeenCalledWith(row.body) })
})
it('hides author actions on other public cards', () => {
  render(<PromptCard row={{ ...row, owned: false, sourceId: null }} copy={async () => {}} edit={() => {}} publish={() => {}} busy={false} t={t} />)
  expect(screen.queryByRole('button', { name: '编辑提示词' })).toBeNull()
  expect(screen.getAllByRole('button')).toHaveLength(1)
})
it('renders success or failure feedback with the appropriate live semantics', () => {
  const view = render(<PromptFeedback feedback="copied" t={t} />)
  expect(screen.getByRole('status').textContent).toContain('已复制提示词')
  view.rerender(<PromptFeedback feedback="copyError" t={t} />)
  expect(screen.getByRole('alert').textContent).toContain('复制失败')
  expect(screen.queryByText('已复制提示词')).toBeNull()
})

it('reveals the published card by moving only the prompt scrollport', () => {
  const view = createPromptViewStore().create()
  const state = { scope: 'one', items: [row], publicItems: [row], busy: [], error: null, failureKind: null, hasMore: false, squarePage: 1, squareQuery: '' }
  const props = {
    useStore: select => select(view.getSnapshot()), usePrompts: select => select(state), actions: view.actions, t,
    loadSquare: () => {}, loadMine: () => {}, close: () => {}, add: () => {}, edit: () => {}, copy: () => {}, publish: () => {}, save: async () => {},
  } as PromptPanelProps
  const rendered = render(<PromptPanel {...props} />)
  const card = rendered.container.querySelector('[data-prompt-id]')!
  const scrollport = card.parentElement!.parentElement!
  scrollport.scrollTop = 600
  view.actions.published(row.id)
  rendered.rerender(<PromptPanel {...props} />)
  expect(scrollport.scrollTop).toBe(0)
  expect(screen.getByRole('tab', { name: '提示词广场' }).getAttribute('aria-selected')).toBe('true')
})
