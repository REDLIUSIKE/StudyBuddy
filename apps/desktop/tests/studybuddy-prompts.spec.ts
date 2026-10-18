import { describe, expect, it } from 'vitest'
import { promptRequest, StudyBuddyPrompts } from '../src/studybuddy/prompts.ts'
import type { MainSession } from '../src/studybuddy/services.ts'

describe('private prompt IPC transport', () => {
  it('pins routes and rejects unexpected operations or author fields', () => {
    expect(promptRequest('mine', [])).toEqual({ path: '/prompts/mine' })
    expect(promptRequest('square', ['测试', 2]).path).toBe('/prompts/square?query=%E6%B5%8B%E8%AF%95&page=2')
    expect(() => promptRequest('deleteAccount', [])).toThrow('PROMPT_OPERATION_DENIED')
    expect(() => promptRequest('save', [{ ownerId: 'other' }])).toThrow('PROMPT_INPUT_INVALID')
  })
  it('returns no HTTP result after an account generation changes', async () => {
    let complete: ((response: Response) => void) | undefined
    let active = true
    const owner = new StudyBuddyPrompts({ withSession: async (run: (session: MainSession) => Promise<unknown>) => {
      const value = await run({ accessToken: 'private', scope: {} as never })
      if (!active) throw new Error('ACCOUNT_SCOPE_CHANGED')
      return value
    } } as never, async () => new Promise(resolve => { complete = resolve }))
    const request = owner.invoke('mine', [])
    active = false
    complete!(Response.json([]))
    await expect(request).rejects.toThrow('ACCOUNT_SCOPE_CHANGED')
  })
})
