// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { AboutStudyBuddySection } from '../src/client/AboutStudyBuddySection.tsx'
import { en, zh, type SupportKey } from '../src/client/locales.ts'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  cleanup()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  vi.restoreAllMocks()
})

function showAbout(dictionary: Record<SupportKey, string> = zh) {
  const props = { t: (key: SupportKey) => dictionary[key] } as ComponentProps<typeof AboutStudyBuddySection>
  return render(<AboutStudyBuddySection {...props} />)
}

it.each([zh, en])('shows public project information without a support host or account', dictionary => {
  showAbout(dictionary)
  expect(screen.getByRole('heading', { name: dictionary.aboutNav })).toBeTruthy()
  expect(screen.getByText('120796873')).toBeTruthy()
  expect(screen.queryByText('1072662622')).toBeNull()
  expect(screen.getByText(dictionary.aboutInvitation)).toBeTruthy()
  expect(screen.getByText(dictionary.aboutOpenSource)).toBeTruthy()
  expect(screen.queryByRole('heading', { name: /项目框架|Project framework/ })).toBeNull()
  expect(screen.getByRole('heading', { name: dictionary.aboutReferences })).toBeTruthy()
  const links = screen.getAllByRole('link')
  expect(links).toHaveLength(7)
  expect(screen.queryByRole('link', { name: 'EchoBird' })).toBeNull()
  expect(screen.getByRole('link', { name: 'K-Dense BYOK' }).getAttribute('href'))
    .toBe('https://github.com/K-Dense-AI/k-dense-byok')
  for (const item of screen.getAllByRole('listitem')) expect(item.querySelector('p')).toBeNull()
  expect(screen.getByRole('link', { name: 'DeepSeek Harness' }).getAttribute('href'))
    .toBe('https://github.com/deepseek-ai/deepseek-harness')
  for (const link of links) {
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  }
})

it('copies only the public QQ group number and confirms a successful write', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  showAbout()
  fireEvent.click(screen.getByRole('button', { name: zh.aboutCopyQq }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(zh.aboutQqCopied))
  expect(writeText).toHaveBeenCalledExactlyOnceWith('120796873')
  expect(screen.getByRole('button', { name: zh.copied })).toBeTruthy()
})

it('keeps the contact selectable when clipboard permission is denied and allows retry', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('permission denied')).mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  showAbout()
  fireEvent.click(screen.getByRole('button', { name: zh.aboutCopyQq }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(zh.aboutCopyFailed))
  expect(screen.queryByRole('button', { name: zh.copied })).toBeNull()
  expect(screen.getByText('120796873')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.aboutCopyQq }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(zh.aboutQqCopied))
  expect(writeText).toHaveBeenCalledTimes(2)
})
