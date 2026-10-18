import { expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { HarnessInstallEventV2 } from '@studybuddy/contracts'
import { NativeAccountClient } from '../src/studybuddy/native-account-client.ts'
const scope = { accountId: 'owner-a', generation: 1 }
it('Main-only approved catalog synchronization crosses the actual private pipe and fences another account', async () => {
  const client = clientFor('mixed')
  try {
    await expect(client.invoke(scope, 'syncNativeModelCatalogs', [])).resolves.toEqual({ schemaVersion: 1, records: [] })
    await expect(client.invoke({ accountId: 'foreign', generation: 1 }, 'syncNativeModelCatalogs', [])).rejects.toMatchObject({
      code: 'ACCOUNT_SCOPE_CHANGED',
    })
  } finally { await client.dispose() }
})
const fixture = fileURLToPath(new URL('./fixtures/studybuddy-native-tools.mjs', import.meta.url))
function clientFor(mode: string) {
  const client = new NativeAccountClient({
    start: async () => spawn(process.execPath, [fixture, mode], { stdio: 'pipe', windowsHide: true }),
  })
  client.useSession({ scope, accessToken: 'synthetic-only-access' })
  return client
}
it('concurrentReplyAndEventsRemainFramed', async () => {
  const client = clientFor('mixed'),
    events: HarnessInstallEventV2[] = []
  try {
    client.subscribeInstallEvents(scope, event => events.push(event))
    const replies = await Promise.all(Array.from({ length: 20 }, () => client.invoke(scope, 'getNativeUserModels', [])))
    expect(replies).toHaveLength(20)
    expect(events).toHaveLength(100)
    expect(new Set(events.map(event => event.seq)).size).toBe(100)
  } finally {
    await client.dispose()
  }
})
it('newStreamInSameGenerationReplacesOldStream', async () => {
  let launches = 0
  const client = new NativeAccountClient({
      start: async () => {
        ++launches
        return spawn(
          process.execPath,
          [fixture, launches === 1 ? 'warmup' : 'restart', launches === 1 ? 'old-stream' : 'new-stream'],
          { stdio: 'pipe', windowsHide: true },
        )
      },
    }),
    delivered: HarnessInstallEventV2[] = [],
    streams: string[] = []
  client.useSession({ scope, accessToken: 'synthetic-first-session' })
  try {
    client.subscribeInstallEvents(scope, event => delivered.push(event))
    client.subscribeInstallStream(scope, stream => streams.push(stream))
    await client.invoke(scope, 'getNativeUserModels', [])
    expect(delivered.map(event => [event.streamId, event.seq])).toEqual([['old-stream', 1]])
    delivered.length = 0
    client.useSession({ scope, accessToken: 'synthetic-next-session' })
    await client.invoke(scope, 'getNativeUserModels', [])
    expect(launches).toBe(2)
    expect(streams).toEqual(['old-stream', 'new-stream'])
    expect(delivered.map(event => [event.streamId, event.seq])).toEqual([['new-stream', 1]])
  } finally {
    await client.dispose()
  }
})
it('eventCannotResolvePendingRequest and unsubscribe stops delivery', async () => {
  const client = clientFor('delayed'),
    events: HarnessInstallEventV2[] = []
  let requestResolvedByEvent = false
  try {
    const off = client.subscribeInstallEvents(scope, event => events.push(event))
    const result = client.invoke(scope, 'getNativeUserModels', []).then((value) => {
      requestResolvedByEvent = true
      return value
    })
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(requestResolvedByEvent).toBe(false)
    expect(await result).toEqual([])
    off()
    await client.invoke(scope, 'getNativeUserModels', [])
    expect(events).toHaveLength(1)
  } finally {
    await client.dispose()
  }
})
it.each(['invalid-length', 'partial-header'])('rejects malformed transport %s', async (mode) => {
  const client = clientFor(mode)
  try {
    await expect(client.invoke(scope, 'getNativeUserModels', [])).rejects.toMatchObject({
      code: mode === 'invalid-length' ? 'NATIVE_FRAME_INVALID' : 'NATIVE_RESULT_UNKNOWN',
    })
  } finally {
    await client.dispose()
  }
})
it('stream notification may synchronously revoke account without resolving ready', async () => {
  const client = clientFor('mixed')
  try {
    client.subscribeInstallStream(scope, () => client.revoke())
    await expect(client.invoke(scope, 'getNativeUserModels', [])).rejects.toMatchObject({
      code: 'ACCOUNT_SCOPE_CHANGED',
    })
  } finally {
    await client.dispose()
  }
})
it.each(['invalid-event-phase', 'invalid-event-extra'])('rejects closed event shape %s', async (mode) => {
  const client = clientFor(mode)
  try {
    await expect(client.invoke(scope, 'getNativeUserModels', [])).rejects.toMatchObject({
      code: 'NATIVE_PROTOCOL_INVALID',
    })
  } finally {
    await client.dispose()
  }
})
