import { expect, it, vi } from 'vitest'
import { ResearchNativeToolBridge } from '../src/studybuddy/research-tool-bridge.ts'
const context = { scope: { accountId: 'account-a', generation: 2 }, hostGeneration: '22222222-2222-4222-8222-222222222222', projectId: 'study', workspaceId: 'workspace-a', sessionId: 'session-a', lease: '33333333-3333-4333-8333-333333333333' }
const request = { schemaVersion: 1, rpcId: '44444444-4444-4444-8444-444444444444', context, toolCallId: 'call-a', operation: 'notebook', input: { record: { type: 'note', title: 'Result' } } }
it('selects the local endpoint and private role from the current native owner', async () => {
  const fetch = vi.fn(async () => Response.json({ logged: true }))
  const owner = new ResearchNativeToolBridge({ isCurrent: () => true, binding: async () => context, origin: async () => 'http://127.0.0.1:41513', headers: () => ({ 'X-StudyBuddy-Research-Tool': 'private', 'X-StudyBuddy-Research-Guest': 'guest' }), fetch })
  expect(await owner.handle(request, new AbortController().signal)).toEqual({ logged: true })
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('http://127.0.0.1:41513/api/research/tools/notebook')
  expect(JSON.parse(String(init.body))).toEqual({ toolCallId: 'call-a', sessionId: 'session-a', record: request.input.record })
  expect(new Headers(init.headers).get('x-project-id')).toBe('study')
})
it('rejects a foreign binding before local dispatch', async () => {
  const fetch = vi.fn(async () => Response.json({ logged: true }))
  const owner = new ResearchNativeToolBridge({ isCurrent: () => true, binding: async () => ({ ...context, sessionId: 'session-foreign' }), origin: async () => 'http://127.0.0.1:41513', headers: () => ({}), fetch })
  await expect(owner.handle(request, new AbortController().signal)).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
  expect(fetch).not.toHaveBeenCalled()
})
it('rejects a delayed old-account result without retrying its write', async () => {
  let current = true
  const fetch = vi.fn(async () => { current = false; return Response.json({ logged: true }) })
  const owner = new ResearchNativeToolBridge({ isCurrent: () => current, binding: async () => context, origin: async () => 'http://127.0.0.1:41513', headers: () => ({ 'X-StudyBuddy-Research-Tool': 'private' }), fetch })
  await expect(owner.handle(request, new AbortController().signal)).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('refuses a foreign service origin', async () => {
  const fetch = vi.fn(async () => Response.json({ logged: true }))
  const owner = new ResearchNativeToolBridge({ isCurrent: () => true, binding: async () => context, origin: async () => 'https://foreign.invalid', headers: () => ({}), fetch })
  await expect(owner.handle(request, new AbortController().signal)).rejects.toThrow('HARNESS_RESEARCH_TOOL_UNAVAILABLE')
  expect(fetch).not.toHaveBeenCalled()
})
