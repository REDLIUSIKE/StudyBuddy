import { expect, it, vi } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { NativeAccountClient } from '../src/studybuddy/native-account-client.ts'

const complete = { localCleared: true, remoteRevoked: true, persistentCleanupRequired: false }
const repair = { localCleared: false, remoteRevoked: true, persistentCleanupRequired: true }
const session = { scope: { accountId: 'fixture-owner', generation: 1 }, accessToken: 'fixture-access' }
const fixturePath = fileURLToPath(new URL('./fixtures/studybuddy-native-recovery.mjs', import.meta.url))
async function fixture(checkpoint: unknown, behavior = '') {
  const directory = await mkdtemp(join(tmpdir(), 'studybuddy-native-recovery-'))
  const children: ChildProcessWithoutNullStreams[] = [], clients: NativeAccountClient[] = [], closed = new Set<ChildProcessWithoutNullStreams>()
  const save = async (value: unknown) => { await writeFile(join(directory, 'checkpoint.json'), JSON.stringify(value)) }
  await save(checkpoint)
  function client(beforeStart: () => Promise<void> = async () => {}) {
    const owner = new NativeAccountClient({ start: async () => {
      await beforeStart()
      const child = spawn(process.execPath, [fixturePath, directory, behavior], { stdio: 'pipe', windowsHide: true })
      children.push(child); child.once('close', () => { closed.add(child) }); return child
    } })
    clients.push(owner); return owner
  }
  return { client, save, children, closed,
    checkpoint: async () => JSON.parse(await readFile(join(directory, 'checkpoint.json'), 'utf8')),
    events: async () => (await readFile(join(directory, 'events.jsonl'), 'utf8')).trim().split('\n').map(value => JSON.parse(value)),
    close: async () => { await Promise.all(clients.map(value => value.dispose())); await rm(directory, { recursive: true, force: true }) },
  }
}

it('checks recovery through a fixed private bootstrap without an account credential', async () => {
  const f = await fixture({ state: 'none' }), client = f.client()
  try {
    expect(await client.recoverLogout()).toEqual({ state: 'none' })
    expect(await f.events()).toEqual([{ keys: ['schemaVersion', 'mode'], mode: 'recoverLogout' }])
    expect(f.closed.has(f.children[0]!)).toBe(true)
    client.useSession(session)
  } finally { await f.close() }
})

it('retains the completed recovery owner until the host explicitly acknowledges cleanup', async () => {
  const f = await fixture({ state: 'complete', outcome: complete }), client = f.client()
  try {
    const first = client.recoverLogout(), second = client.recoverLogout()
    expect(await first).toEqual(await second)
    expect(f.children).toHaveLength(1)
    client.revoke()
    expect(f.children[0]?.exitCode).toBeNull()
    expect(() => client.useSession(session)).toThrow('ACCOUNT_SCOPE_CHANGED')
    await expect(client.invoke(session.scope, 'listNativeUserSources', [])).rejects.toMatchObject({ code: 'ACCOUNT_SCOPE_CHANGED' })
    await client.acknowledgeLogout()
    expect(await f.checkpoint()).toEqual({ state: 'none' })
    expect(f.closed.has(f.children[0]!)).toBe(true)
    expect(await f.events()).toEqual([
      { keys: ['schemaVersion', 'mode'], mode: 'recoverLogout' },
      { keys: ['schemaVersion', 'mode'], mode: 'acknowledgeLogout' },
    ])
    client.useSession(session)
    expect(await f.client().recoverLogout()).toEqual({ state: 'none' })
  } finally { await f.close() }
})

it('retains repair state across separate clients and replays recovery after repair', async () => {
  const f = await fixture({ state: 'pending', outcome: repair }), first = f.client()
  try {
    expect(await first.recoverLogout()).toEqual({ state: 'pending', outcome: repair })
    await expect(first.acknowledgeLogout()).rejects.toMatchObject({ code: 'NATIVE_LOGOUT_NOT_COMPLETE' })
    await first.dispose()
    const second = f.client()
    expect(await second.recoverLogout()).toEqual({ state: 'pending', outcome: repair })
    await f.save({ state: 'complete', outcome: complete })
    expect(await second.recoverLogout()).toEqual({ state: 'complete', outcome: complete })
    await second.acknowledgeLogout()
    expect(await f.checkpoint()).toEqual({ state: 'none' })
  } finally { await f.close() }
})

it.each([
  { state: 'complete', outcome: repair },
  { state: 'complete', outcome: complete, error: { code: 'NATIVE_LOGOUT_RECOVERY_FAILED' } },
  { state: 'none', scope: session.scope },
  { state: 'pending', outcome: repair, error: { code: 'unsafe provider secret' } },
  { state: 'complete', outcome: { ...complete, accessToken: 'fixture-access' } },
])('rejects an invalid recovery frame and keeps account access blocked (%j)', async checkpoint => {
  const f = await fixture(checkpoint), client = f.client()
  try {
    await expect(client.recoverLogout()).rejects.toMatchObject({ code: 'NATIVE_LOGOUT_RECOVERY_INVALID' })
    expect(() => client.useSession(session)).toThrow('ACCOUNT_SCOPE_CHANGED')
    expect(await f.checkpoint()).toEqual(checkpoint)
  } finally { await f.close() }
})

it('retains a failed acknowledgment and retries from the original durable checkpoint', async () => {
  const f = await fixture({ state: 'complete', outcome: complete }, 'ack-fail'), client = f.client()
  try {
    await client.recoverLogout()
    await expect(client.acknowledgeLogout()).rejects.toMatchObject({ code: 'NATIVE_LOGOUT_ACK_FAILED' })
    expect(await f.checkpoint()).toEqual({ state: 'complete', outcome: complete })
    expect(() => client.useSession(session)).toThrow('ACCOUNT_SCOPE_CHANGED')
    expect(await client.recoverLogout()).toEqual({ state: 'complete', outcome: complete })
  } finally { await f.close() }
})

it('handles a lost acknowledgment only when this owner actually sent the acknowledgment', async () => {
  const f = await fixture({ state: 'complete', outcome: complete }, 'ack-drop-once'), client = f.client()
  try {
    await client.recoverLogout()
    await expect(client.acknowledgeLogout()).rejects.toMatchObject({ code: 'NATIVE_RESULT_UNKNOWN' })
    expect(await f.checkpoint()).toEqual({ state: 'none' })
    expect(await client.recoverLogout()).toEqual({ state: 'complete', outcome: complete })
    await client.acknowledgeLogout()
    client.useSession(session)
  } finally { await f.close() }
})

it('does not treat a missing checkpoint as permission to acknowledge fresh logout', async () => {
  const f = await fixture({ state: 'none' }), client = f.client()
  try {
    await client.recoverLogout()
    await expect(client.acknowledgeLogout()).rejects.toMatchObject({ code: 'NATIVE_LOGOUT_NOT_COMPLETE' })
    expect(await f.checkpoint()).toEqual({ state: 'none' })
  } finally { await f.close() }
})

it('keeps fresh logout isolated until the host acknowledges its persisted completion', async () => {
  const f = await fixture({ state: 'none' }), client = f.client()
  try {
    expect(await client.logout(session)).toEqual(complete)
    expect(() => client.useSession(session)).toThrow('ACCOUNT_SCOPE_CHANGED')
    await client.acknowledgeLogout()
    expect(await f.checkpoint()).toEqual({ state: 'none' })
    expect((await f.events()).map(value => value.mode ?? value.method)).toEqual([undefined, 'logoutNativeAccount', 'recoverLogout', 'acknowledgeLogout'])
    client.useSession(session)
  } finally { await f.close() }
})

it('rejects an extra startup frame field before exposing any account operation', async () => {
  const f = await fixture({ state: 'complete', outcome: complete }, 'outer-extra'), client = f.client()
  try {
    await expect(client.recoverLogout()).rejects.toMatchObject({ code: 'NATIVE_LOGOUT_RECOVERY_INVALID' })
    expect(() => client.useSession(session)).toThrow('ACCOUNT_SCOPE_CHANGED')
  } finally { await f.close() }
})

it('does not unlock a missing completion checkpoint before any acknowledgment was sent', async () => {
  const f = await fixture({ state: 'none' }), client = f.client()
  try {
    await client.logout(session)
    await f.save({ state: 'none' })
    await expect(client.acknowledgeLogout()).rejects.toMatchObject({ code: 'NATIVE_LOGOUT_CHECKPOINT_MISSING' })
    expect(() => client.useSession(session)).toThrow('ACCOUNT_SCOPE_CHANGED')
  } finally { await f.close() }
})

it('quiesces an old business child before starting recovery', async () => {
  const f = await fixture({ state: 'none' }), client = f.client()
  try {
    client.useSession(session)
    const old = client.invoke(session.scope, 'listNativeUserSources', [])
    const rejected = expect(old).rejects.toMatchObject({ code: 'ACCOUNT_SCOPE_CHANGED' })
    await vi.waitFor(() => { expect(f.children).toHaveLength(1) })
    expect(await client.recoverLogout()).toEqual({ state: 'none' })
    await rejected
    expect(f.children).toHaveLength(2)
    expect(f.children.every(child => f.closed.has(child))).toBe(true)
  } finally { await f.close() }
})

it('waits for a delayed spawn to close when the auth owner is disposed', async () => {
  let start: (() => void) | undefined
  const f = await fixture({ state: 'none' }), client = f.client(() => new Promise(resolve => { start = resolve }))
  try {
    const rejected = expect(client.recoverLogout()).rejects.toMatchObject({ code: 'ACCOUNT_SCOPE_CHANGED' })
    await vi.waitFor(() => { expect(start).toBeDefined() })
    const disposed = client.dispose()
    start!()
    await rejected; await disposed
    expect(f.children).toHaveLength(1)
    expect(f.closed.has(f.children[0]!)).toBe(true)
    expect(() => client.useSession(session)).toThrow('ACCOUNT_SCOPE_CHANGED')
  } finally { await f.close() }
})
