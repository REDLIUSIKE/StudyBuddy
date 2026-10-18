import { expect, it } from 'vitest'
import { StudyBuddyAuth, type MainSession } from '../src/studybuddy/services.ts'

const owner = '11111111-1111-4111-8111-111111111111'
const complete = { localCleared: true, remoteRevoked: true, persistentCleanupRequired: false }
type Outcome = typeof complete
function fixture(logoutSession?: (session: MainSession) => Promise<Outcome>) {
  let stored: string | null = 'fixture-refresh'
  let clears = 0
  const requests: string[] = []
  const auth = new StudyBuddyAuth({
    async fetch(url) {
      requests.push(url)
      if (url.endsWith('/auth/refresh')) return Response.json({ accessToken: 'fixture-access', accessTokenExpiresInSeconds: 900, refreshToken: 'fixture-rotated', refreshTokenExpiresInSeconds: 2592000 })
      if (url.endsWith('/me')) return Response.json({ id: owner, status: 'active' })
      throw new Error('Unexpected fixture request')
    },
    vault: { read: async () => stored, write: async value => { stored = value }, clear: async () => { ++clears; stored = null } },
    openBrowser: async () => {}, schedule: () => () => {},
    ...(logoutSession ? { logoutSession } : {}),
  })
  return { auth, requests, stored: () => stored, clears: () => clears }
}

it('clears the refresh credential only after the original native logout outcome', async () => {
  const sessions: MainSession[] = []
  const f = fixture(async session => { sessions.push(session); return complete })
  await f.auth.restore()
  const scope = f.auth.scope()
  const state = await f.auth.logout()
  expect(state).toMatchObject({ phase: 'signed-out', logoutOutcome: complete })
  expect(sessions[0]).toEqual({ scope, accessToken: 'fixture-access' })
  expect(f.requests.some(url => url.endsWith('/auth/logout'))).toBe(false)
  expect(f.stored()).toBeNull()
  expect(JSON.stringify(state)).not.toContain('fixture-access')
})

it('retains failed native proof for retry while blocking business and reauthorization', async () => {
  let attempts = 0
  const f = fixture(async () => { if (++attempts === 1) throw new Error('INVALID_RESPONSE'); return complete })
  await f.auth.restore()
  expect(await f.auth.logout()).toMatchObject({ phase: 'error', logoutPending: true })
  expect(f.stored()).toBe('fixture-rotated')
  expect(f.auth.scope()).toBeNull()
  await expect(f.auth.withSession(async () => 'old-account-data')).rejects.toThrow('AUTH_REQUIRED')
  await f.auth.restore(); await f.auth.start(); await f.auth.cancel()
  expect(f.requests).toHaveLength(2)
  expect((await f.auth.logout()).phase).toBe('signed-out')
  expect(attempts).toBe(2)
})

it('shares an in-flight logout and does not let a refresh replace its account', async () => {
  let finish: (value: Outcome) => void = () => { throw new Error('Not started') }
  let attempts = 0
  const f = fixture(() => { ++attempts; return new Promise(resolve => { finish = resolve }) })
  await f.auth.restore()
  const first = f.auth.logout(), second = f.auth.logout()
  expect(f.auth.state).toMatchObject({ phase: 'starting', logoutPending: true })
  expect(f.auth.scope()).toBeNull()
  await f.auth.restore(); await f.auth.start()
  expect(f.requests).toHaveLength(2)
  expect(attempts).toBe(1)
  finish(complete)
  expect(await first).toEqual(await second)
})

it('reports native repair separately from confirmed remote revocation', async () => {
  const repair = { ...complete, localCleared: false, persistentCleanupRequired: true }
  const f = fixture(async () => repair)
  await f.auth.restore()
  expect(await f.auth.logout()).toMatchObject({ phase: 'error', logoutPending: true, logoutOutcome: repair, message: expect.any(String) })
  expect(f.stored()).toBe('fixture-rotated')
})

it('rejects missing native logout capability without a loose remote revoke', async () => {
  const f = fixture()
  await f.auth.restore()
  expect((await f.auth.logout()).phase).toBe('error')
  expect(f.requests).toHaveLength(2)
  expect(f.clears()).toBe(0)
})

it('does not clear credentials or publish a late logout after disposal', async () => {
  let finish: (value: Outcome) => void = () => { throw new Error('Not started') }
  const f = fixture(() => new Promise(resolve => { finish = resolve }))
  await f.auth.restore()
  const pending = f.auth.logout()
  f.auth.dispose()
  const before = f.auth.state
  finish(complete); await pending
  expect(f.auth.state).toBe(before)
  expect(f.clears()).toBe(0)
})
