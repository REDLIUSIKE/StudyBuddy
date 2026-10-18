// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StudyBuddyWelcome } from '../src/client/StudyBuddyWelcome.tsx'
import type { StudyBuddyApi, StudyBuddyAuthState } from '../src/studybuddy/types.ts'

afterEach(cleanup)
function setup(status = Promise.resolve<StudyBuddyAuthState>({ phase: 'signed-out' })) {
  let listener: (value: StudyBuddyAuthState) => void = () => {}
  const api: StudyBuddyApi = {
    status: vi.fn(() => status),
    start: vi.fn<StudyBuddyApi['start']>(async () => ({ phase: 'waiting' })),
    cancel: vi.fn<StudyBuddyApi['cancel']>(async () => ({ phase: 'signed-out' })),
    logout: vi.fn<StudyBuddyApi['logout']>(async () => ({ phase: 'signed-out' })),
    checkUpdates: vi.fn<StudyBuddyApi['checkUpdates']>(async () => ({ phase: 'idle', message: '' })),
    subscribe: (value) => { listener = value; return () => { listener = () => {} } },
  }
  render(<StudyBuddyWelcome api={api} />)
  return { api, emit: (value: StudyBuddyAuthState) => { act(() => { listener(value) }) } }
}
it('offers a login-state recheck without treating a failed detector as an unfinished logout', async () => {
  const view = setup(Promise.resolve({ phase: 'error', logoutPending: true, startupRecoveryFailed: true }))
  await act(async () => {})
  expect(screen.getByRole('heading').textContent).toBe('登录状态检查失败')
  expect(screen.queryByRole('button', { name: '重试退出登录' })).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重新检查' })) })
  expect(view.api.start).toHaveBeenCalledOnce()
  expect(view.api.logout).not.toHaveBeenCalled()
})
it('keeps a newer authorization state when the initial snapshot arrives late', async () => {
  const snapshot = Promise.withResolvers<StudyBuddyAuthState>()
  const view = setup(snapshot.promise)
  view.emit({ phase: 'waiting' })
  await act(async () => { snapshot.resolve({ phase: 'signed-out' }); await snapshot.promise })
  expect(screen.getByRole('button', { name: '返回登录窗口' })).toBeTruthy()
})
it('does not restore waiting after cancellation when an older start resolves', async () => {
  const view = setup()
  await act(async () => {})
  const started = Promise.withResolvers<StudyBuddyAuthState>()
  vi.mocked(view.api.start).mockReturnValue(started.promise)
  fireEvent.click(screen.getByRole('button', { name: '登录 StudyBuddy' }))
  view.emit({ phase: 'waiting' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '取消登录' })) })
  await act(async () => { started.resolve({ phase: 'waiting' }); await started.promise })
  expect(screen.getByRole('button', { name: '登录 StudyBuddy' })).toBeTruthy()
})
it('focuses the existing authorization window while waiting', async () => {
  const view = setup()
  await act(async () => {})
  view.emit({ phase: 'waiting' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '返回登录窗口' })) })
  expect(view.api.start).toHaveBeenCalledOnce()
})
it('retries the pending logout without opening authorization again',async()=>{
  const view=setup(Promise.resolve({phase:'error',logoutPending:true,message:'请重试退出。'}))
  await act(async()=>{})
  expect(screen.queryByRole('button',{name:'重新登录'})).toBeNull()
  expect(screen.queryByRole('button',{name:'取消登录'})).toBeNull()
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'重试退出登录'}))})
  expect(view.api.logout).toHaveBeenCalledOnce();expect(view.api.start).not.toHaveBeenCalled()
})
it('keeps the original repair outcome visible after confirmed logout',async()=>{
  setup(Promise.resolve({phase:'signed-out',logoutOutcome:{localCleared:true,remoteRevoked:true,persistentCleanupRequired:true},message:'已退出账号；原有工具连接仍需恢复清理。'}))
  await act(async()=>{})
  expect(screen.getByRole('status').textContent).toContain('原有工具连接仍需恢复清理')
  expect(screen.getByRole('button',{name:'登录 StudyBuddy'}).hasAttribute('disabled')).toBe(false)
})
