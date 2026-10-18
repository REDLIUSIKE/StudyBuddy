import { describe, expect, it } from 'vitest'
import { studyBuddyWorkspaceTransition } from '../src/studybuddy/workspace-transition.ts'

describe('StudyBuddy workspace identity', () => {
  it('resumes the same account after locking for a recoverable error', () => {
    expect(studyBuddyWorkspaceTransition({ phase: 'error' }, 'account-a', true)).toBe('lock')
    expect(studyBuddyWorkspaceTransition({ phase: 'authenticated', account: { id: 'account-a', label: '用户' } }, 'account-a', false)).toBe('resume')
    expect(studyBuddyWorkspaceTransition({ phase: 'authenticated', account: { id: 'account-a', label: '用户' } }, 'account-a', true)).toBe('none')
  })
  it('relaunches into a separate profile for a new account or sign-out', () => {
    expect(studyBuddyWorkspaceTransition({ phase: 'authenticated', account: { id: 'account-b', label: '用户' } }, 'account-a', false)).toBe('relaunch')
    expect(studyBuddyWorkspaceTransition({ phase: 'authenticated', account: { id: 'account-a', label: '用户' } }, undefined, false)).toBe('relaunch')
    expect(studyBuddyWorkspaceTransition({ phase: 'signed-out' }, 'account-a', true)).toBe('relaunch')
  })
})
