import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { StudyBuddyAuth } from '../src/studybuddy/services.ts'

const requestId = '11111111-1111-4111-8111-111111111111'
const started = { requestId, authorizationUrl: `https://guijitongzhuo.com/login/desktop?request=${requestId}`, cancelToken: 'c'.repeat(43), pollToken: 'p'.repeat(43), nextPollAfterMs: 2000, expiresInSeconds: 300 }
const tokens = { accessToken: 'access', accessTokenExpiresInSeconds: 900, refreshToken: 'refresh', refreshTokenExpiresInSeconds: 2592000 }
function setup(responses: Response[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init === undefined ? {} : { init }) })
    const response = responses.shift(); if (!response) throw new Error('unexpected call'); return response
  })
  let stored: string | null = null
  const vault = {
    read: vi.fn(async () => stored), write: vi.fn(async (value: string) => { stored = value }), clear: vi.fn(async () => { stored = null }),
  }
  const open = vi.fn(async () => {})
  const logoutSession = vi.fn(async (_session: { scope: { accountId: string; generation: number }; accessToken: string }) => ({ localCleared: true, remoteRevoked: true, persistentCleanupRequired: false }))
  const auth = new StudyBuddyAuth({ fetch: fetcher, vault, openBrowser: open, schedule: () => () => {}, logoutSession })
  return { auth, calls, fetcher, vault, open, logoutSession }
}
const json = (value: unknown) => Response.json(value)
function body(value: RequestInit['body']): Record<string, string> {
  if (typeof value !== 'string') throw new Error('Expected a JSON body')
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Object.values(parsed).some(item => typeof item !== 'string')) {
    throw new Error('Expected string-valued request fields')
  }
  return parsed as Record<string, string>
}
describe('StudyBuddy auth', () => {
  it('token refresh keeps login scope but a different owner rejects an old result', async () => {
    const s=setup([json(tokens),json({id:requestId,status:'active'}),json({...tokens,accessToken:'access-2'}),json({id:requestId,status:'active'}),json({...tokens,accessToken:'access-3'}),json({id:'22222222-2222-4222-8222-222222222222',status:'active'})]);
    s.vault.read.mockResolvedValue('refresh');
    await s.auth.restore();
    const before=await s.auth.withSession(async session=>session.scope);
    await s.auth.restore();
    expect(await s.auth.withSession(async session=>session.scope)).toEqual(before);
    let finish:(value:string)=>void=()=>{throw new Error('not started')};
    const late=s.auth.withSession(async ()=>new Promise<string>(resolve=>{finish=resolve}));
    const rejected=expect(late).rejects.toThrow('ACCOUNT_SCOPE_CHANGED');
    await s.auth.restore();finish('old-account-data');await rejected;
  })
  it('uses S256 and keeps credentials out of state', async () => {
    const s = setup([json(started), json({ status: 'authenticated', ...tokens }), json({ id: requestId, status: 'active', phoneMasked: '138****0000' })])
    expect((await s.auth.start()).phase).toBe('waiting')
    await s.auth.poll()
    expect(s.auth.state).toEqual({ phase: 'authenticated', account: { id: requestId, label: '138****0000' } })
    const startBody = body(s.calls[0]?.init?.body)
    const pollBody = body(s.calls[1]?.init?.body)
    expect(startBody.codeChallenge).toBe(createHash('sha256').update(pollBody.codeVerifier ?? '').digest('base64url'))
    expect(startBody.clientLabel).toBe('StudyBuddy Windows')
    expect(s.open).toHaveBeenCalledWith(started.authorizationUrl)
    expect(s.vault.write).toHaveBeenCalledWith('refresh')
    expect(JSON.stringify(s.auth.state)).not.toContain('accessToken')
  })
  it('rejects an authorization URL outside our official origin', async () => {
    const s = setup([json({ ...started, authorizationUrl: 'https://evil.example/login' })])
    expect((await s.auth.start()).phase).toBe('error')
    expect(s.open).not.toHaveBeenCalled()
  })
  it('restores via refresh then reads the authenticated account', async () => {
    const s = setup([json(tokens), json({ id: requestId, status: 'active', emailMasked: 'a***@example.com' })])
    s.vault.read.mockResolvedValue('old-refresh')
    expect((await s.auth.restore()).phase).toBe('authenticated')
    expect(s.calls[0]?.url).toBe('https://guijitongzhuo.com/api/v1/auth/refresh')
    expect(body(s.calls[0]?.init?.body)).toEqual({ refreshToken: 'old-refresh' })
  })
  it('cancels the exact request and stops further polling', async () => {
    const s = setup([json(started), new Response(null, { status: 204 })])
    await s.auth.start(); await s.auth.cancel(); await s.auth.poll()
    expect(s.auth.state.phase).toBe('signed-out')
    expect(s.calls).toHaveLength(2)
    expect(body(s.calls[1]?.init?.body)).toEqual({ requestId, cancelToken: started.cancelToken })
  })
  it('does not erase a recoverable session when refresh is offline', async () => {
    const s = setup([]); s.vault.read.mockResolvedValue('old-refresh')
    expect((await s.auth.restore()).phase).toBe('error')
    expect(s.vault.clear).not.toHaveBeenCalled()
  })
  it('shares recovery when login is retried while a refresh is pending', async () => {
    const s = setup([])
    s.vault.read.mockResolvedValue('old-refresh')
    await s.auth.restore()
    let resolveRefresh: (value: Response) => void = () => {}
    s.fetcher.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRefresh = resolve }))
    s.fetcher.mockImplementationOnce(async () => json({ id: requestId, status: 'active' }))
    const first = s.auth.start()
    await vi.waitFor(() => { expect(s.fetcher).toHaveBeenCalledTimes(2) })
    const second = s.auth.start()
    const repeatedRestore = s.auth.restore()
    await Promise.resolve()
    expect(s.fetcher).toHaveBeenCalledTimes(2)
    resolveRefresh(json(tokens))
    await Promise.all([first, second, repeatedRestore])
    expect(s.auth.state.phase).toBe('authenticated')
    expect(s.fetcher).toHaveBeenCalledTimes(3)
  })
  it('revokes a cancelled recovery without retaining its consumed refresh credential', async () => {
    const s = setup([])
    await s.vault.write('old-refresh')
    let resolveRefresh: (value: Response) => void = () => {}
    s.fetcher.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRefresh = resolve }))
    const recovery = s.auth.restore()
    await vi.waitFor(() => { expect(s.fetcher).toHaveBeenCalledTimes(1) })
    await s.auth.cancel()
    s.fetcher.mockImplementationOnce(async () => json({ revoked: true }))
    resolveRefresh(json(tokens))
    await recovery
    expect(s.auth.state.phase).toBe('signed-out')
    expect(await s.vault.read()).toBeNull()
    expect(s.fetcher.mock.calls[1]?.[0]).toBe('https://guijitongzhuo.com/api/v1/auth/logout')
  })
  it('polls a new login while the cancelled generation is still in flight', async () => {
    const s = setup([json(started)])
    await s.auth.start()
    let resolveOldPoll: (value: Response) => void = () => {}
    s.fetcher.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOldPoll = resolve }))
    const oldPoll = s.auth.poll()
    s.fetcher.mockImplementationOnce(async () => new Response(null, { status: 204 }))
    await s.auth.cancel()
    const newRequest = '22222222-2222-4222-8222-222222222222'
    s.fetcher.mockImplementationOnce(async () => json({ ...started, requestId: newRequest, authorizationUrl: `https://guijitongzhuo.com/login/desktop?request=${newRequest}` }))
    await s.auth.start()
    s.fetcher.mockImplementationOnce(async () => json({ status: 'authenticated', ...tokens }))
    s.fetcher.mockImplementationOnce(async () => json({ id: requestId, status: 'active' }))
    const newPoll = s.auth.poll()
    await vi.waitFor(() => { expect(s.vault.write).toHaveBeenCalledWith(tokens.refreshToken) })
    resolveOldPoll(json({ status: 'pending', nextPollAfterMs: 2000 }))
    await Promise.all([oldPoll, newPoll])
    expect(s.auth.state.phase).toBe('authenticated')
  })
  it('does not wait forever when authorization succeeds but account lookup fails', async () => {
    const s = setup([json(started), json({ status: 'authenticated', ...tokens }), new Response(null, { status: 503 })])
    await s.auth.start(); await s.auth.poll()
    expect(s.auth.state.phase).toBe('error')
    expect(s.vault.write).toHaveBeenCalledWith(tokens.refreshToken)
  })
  it('does not restore a cancelled authorization after a late account response', async () => {
    const s = setup([json(started), json({ status: 'authenticated', ...tokens })])
    await s.auth.start()
    let resolveAccount: (value: Response) => void = () => {}
    s.fetcher.mockImplementationOnce(async () => json({ status: 'authenticated', ...tokens }))
    s.fetcher.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveAccount = resolve }))
    const poll = s.auth.poll()
    await vi.waitFor(() => { expect(s.vault.write).toHaveBeenCalled() })
    await s.auth.cancel()
    resolveAccount(json({ id: requestId, status: 'active' }))
    await poll
    expect(s.auth.state.phase).toBe('signed-out')
    expect(await s.vault.read()).toBeNull()
  })
  it('revokes the server session before clearing the local credential', async () => {
    const s = setup([json(tokens), json({ id: requestId, status: 'active' })])
    s.vault.read.mockResolvedValue('old-refresh')
    await s.auth.restore(); await s.auth.logout()
    expect(s.calls).toHaveLength(2)
    expect(s.logoutSession).toHaveBeenCalledWith({ scope: { accountId: requestId, generation: 1 }, accessToken: 'access' })
    expect(s.vault.clear).toHaveBeenCalled()
    expect(s.auth.state.phase).toBe('signed-out')
  })
  it('revokes the account scope while logout is still in flight',async()=>{
    const s=setup([json(tokens),json({id:requestId,status:'active'})]);s.vault.read.mockResolvedValue('old-refresh')
    await s.auth.restore();expect(s.auth.scope()).not.toBeNull()
    let finish:(value:{localCleared:boolean;remoteRevoked:boolean;persistentCleanupRequired:boolean})=>void=()=>{};s.logoutSession.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
    const logout=s.auth.logout();expect(s.auth.scope()).toBeNull()
    await expect(s.auth.withSession(async()=>true)).rejects.toThrow('AUTH_REQUIRED')
    finish({localCleared:true,remoteRevoked:true,persistentCleanupRequired:false});await logout;expect(s.auth.state.phase).toBe('signed-out')
  })
})
describe('StudyBuddy update ownership', () => {
  it('leaves product updates to the single Electron coordinator', () => {
    const source = readFileSync(new URL('../src/studybuddy/services.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('class StudyBuddyUpdates')
    expect(source).not.toContain('/public/client-updates/check')
    expect(source).not.toContain('parseDynamicUpdateResponse')
  })
})
