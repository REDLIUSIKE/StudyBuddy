import { expect, it } from 'vitest'
import { StudyBuddyAuth } from '../src/studybuddy/services.ts'

const owner = '11111111-1111-4111-8111-111111111111'
const complete = { localCleared: true, remoteRevoked: true, persistentCleanupRequired: false }
const repair = { localCleared: false, remoteRevoked: true, persistentCleanupRequired: true }
type Recovery = { state: 'none' } | { state: 'pending' | 'complete'; outcome: typeof complete }

function fixture(recover: () => Promise<Recovery>, acknowledge = async () => {}) {
  let stored: string | null = 'fixture-refresh'
  let clearFailure = false
  const calls: string[] = []
  const auth = new StudyBuddyAuth({
    fetch: async url => {
      calls.push(url.endsWith('/me') ? 'me' : 'refresh')
      if (url.endsWith('/auth/refresh')) return Response.json({ accessToken: 'fixture-access', accessTokenExpiresInSeconds: 900, refreshToken: 'fixture-rotated', refreshTokenExpiresInSeconds: 2592000 })
      if (url.endsWith('/me')) return Response.json({ id: owner, status: 'active' })
      throw new Error('Unexpected fixture request')
    },
    vault: {
      read: async () => stored,
      write: async value => { stored = value },
      clear: async () => { calls.push('clear'); if (clearFailure) throw new Error('Fixture secure storage failure'); stored = null },
    },
    openBrowser: async () => { calls.push('browser') }, schedule: () => () => {},
    logoutSession: async () => { calls.push('logout'); return complete },
    logoutRecovery: {
      recover: async () => { calls.push('recover'); return recover() },
      acknowledge: async () => { calls.push('ack'); await acknowledge() },
    },
  })
  return { auth, calls, stored: () => stored, failClear: (value: boolean) => { clearFailure = value } }
}

it('resumes a completed native checkpoint before refreshing a revoked credential', async () => {
  const f = fixture(async () => ({ state: 'complete', outcome: complete }))
  expect(await f.auth.restore()).toMatchObject({ phase: 'signed-out', logoutOutcome: complete })
  expect(f.calls).toEqual(['recover', 'clear', 'ack'])
  expect(f.stored()).toBeNull()
  expect(f.auth.scope()).toBeNull()
})

it('blocks account data and reauthorization while original cleanup needs repair', async () => {
  let repaired = false
  const f = fixture(async () => repaired ? { state: 'complete', outcome: complete } : { state: 'pending', outcome: repair })
  expect(await f.auth.restore()).toMatchObject({ phase: 'error', logoutPending: true, logoutOutcome: repair })
  await expect(f.auth.withSession(async () => 'old-account')).rejects.toThrow('AUTH_REQUIRED')
  await f.auth.start(); await f.auth.cancel()
  expect(f.calls).toEqual(['recover'])
  expect(f.stored()).toBe('fixture-refresh')
  repaired = true
  expect(await f.auth.logout()).toMatchObject({ phase: 'signed-out', logoutOutcome: complete })
  expect(f.calls).toEqual(['recover', 'recover', 'clear', 'ack'])
})

it('keeps startup locked when the protected native checkpoint cannot be read', async () => {
  let readable = false
  const f = fixture(async () => { if (!readable) throw new Error('Fixture protected store unavailable'); return { state: 'none' } })
  expect(await f.auth.restore()).toMatchObject({ phase: 'error', logoutPending: true })
  await f.auth.start(); await f.auth.cancel()
  expect(f.calls).toEqual(['recover', 'recover'])
  readable = true
  const states: string[] = []
  f.auth.subscribe(state => { states.push(state.phase) })
  expect(await f.auth.logout()).toMatchObject({ phase: 'signed-out', logoutOutcome: complete })
  expect(f.calls).toEqual(['recover', 'recover', 'recover', 'refresh', 'me', 'logout', 'clear', 'ack'])
  expect(f.stored()).toBeNull()
  expect(states).not.toContain('authenticated')
  expect(await f.auth.restore()).toMatchObject({ phase: 'signed-out' })
})

it('leaves a completed checkpoint unacknowledged until local credential deletion succeeds', async () => {
  const f = fixture(async () => ({ state: 'complete', outcome: complete }))
  f.failClear(true)
  expect(await f.auth.restore()).toMatchObject({ phase: 'error', logoutPending: true })
  expect(f.calls).toEqual(['recover', 'clear'])
  expect(f.stored()).toBe('fixture-refresh')
  f.failClear(false)
  expect(await f.auth.logout()).toMatchObject({ phase: 'signed-out' })
  expect(f.calls.slice(-2)).toEqual(['clear', 'ack'])
})

it('retries acknowledgment after host credential deletion without restoring the revoked login', async () => {
  let acknowledged = false
  const f = fixture(async () => ({ state: 'complete', outcome: complete }), async () => { if (!acknowledged) throw new Error('Fixture native acknowledgment failed') })
  expect(await f.auth.restore()).toMatchObject({ phase: 'error', logoutPending: true })
  expect(f.stored()).toBeNull()
  acknowledged = true
  expect(await f.auth.logout()).toMatchObject({ phase: 'signed-out', logoutOutcome: complete })
  expect(f.calls).not.toContain('refresh')
  expect(f.calls).not.toContain('me')
})

it('checks native recovery once per running auth owner before the normal restore path', async () => {
  const f = fixture(async () => ({ state: 'none' }))
  expect(await f.auth.restore()).toMatchObject({ phase: 'authenticated' })
  await f.auth.restore()
  expect(f.calls).toEqual(['recover', 'refresh', 'me', 'refresh', 'me'])
})

it('rechecks a failed startup detector and restores the original login without logging it out', async () => {
  let available = false
  const f = fixture(async () => {
    if (!available) throw new Error('NATIVE_RUNTIME_INVALID')
    return { state: 'none' }
  })
  expect(await f.auth.restore()).toMatchObject({ phase: 'error', startupRecoveryFailed: true })
  available = true
  expect(await f.auth.start()).toMatchObject({ phase: 'authenticated' })
  expect(f.calls).toEqual(['recover', 'recover', 'refresh', 'me'])
  expect(f.stored()).toBe('fixture-rotated')
})

it('keeps real pending cleanup fenced after a startup detector becomes available', async () => {
  let available = false
  const f = fixture(async () => {
    if (!available) throw new Error('NATIVE_RUNTIME_INVALID')
    return { state: 'pending', outcome: repair }
  })
  await f.auth.restore()
  available = true
  expect(await f.auth.start()).toMatchObject({ phase: 'error', logoutPending: true, logoutOutcome: repair })
  expect(f.auth.state.startupRecoveryFailed).not.toBe(true)
  await f.auth.start()
  expect(f.calls).toEqual(['recover', 'recover'])
  expect(f.stored()).toBe('fixture-refresh')
})

it('acknowledges fresh logout only after clearing the host refresh vault', async () => {
  const f = fixture(async () => ({ state: 'none' }))
  await f.auth.restore()
  expect(await f.auth.logout()).toMatchObject({ phase: 'signed-out' })
  expect(f.calls.slice(-3)).toEqual(['logout', 'clear', 'ack'])
})

it('does not publish or clear a late recovery result after disposal', async () => {
  let finish: (value: Recovery) => void = () => { throw new Error('Not started') }
  const f = fixture(() => new Promise(resolve => { finish = resolve }))
  const restoring = f.auth.restore()
  f.auth.dispose()
  const before = f.auth.state
  finish({ state: 'complete', outcome: complete })
  await restoring
  expect(f.auth.state).toBe(before)
  expect(f.calls).toEqual(['recover'])
})

it('does not publish an expired private restore after disposal during vault deletion', async () => {
  let readable = false
  let started: () => void = () => { throw new Error('Not started') }
  let finish: () => void = () => { throw new Error('Not started') }
  const clearing = new Promise<void>(resolve => { started = resolve })
  const cleared = new Promise<void>(resolve => { finish = resolve })
  const auth = new StudyBuddyAuth({
    fetch: async () => new Response(null, { status: 401 }),
    vault: { read: async () => 'fixture-refresh', write: async () => {}, clear: async () => { started(); await cleared } },
    openBrowser: async () => {}, schedule: () => () => {},
    logoutRecovery: { recover: async () => { if (!readable) throw new Error('Fixture protected store unavailable'); return { state: 'none' } }, acknowledge: async () => {} },
  })
  expect(await auth.restore()).toMatchObject({ phase: 'error', logoutPending: true })
  readable = true
  const retrying = auth.logout()
  await clearing
  auth.dispose()
  const before = auth.state
  finish()
  await retrying
  expect(auth.state).toBe(before)
})
