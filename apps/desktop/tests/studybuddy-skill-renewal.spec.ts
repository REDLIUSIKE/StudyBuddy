import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { SkillsNativeClient } from '../src/studybuddy/skill-native-client.ts'

const scope = { accountId: 'synthetic-skills', generation: 7 }
const fixture = () => new SkillsNativeClient({ start: async () => spawn(process.execPath,
  [fileURLToPath(new URL('./fixtures/studybuddy-skill-pipe.mjs', import.meta.url))],
  { stdio: 'pipe', windowsHide: true }) }, { scope, accessToken: 'synthetic-only' },
join(tmpdir(), 'synthetic-harness'), '0.2.1-alpha.2')
const page = 'https://guijitongzhuo.com/skills?embed=desktop&host_ui=harness'

it('renews a retained Skill companion without replacing its process or bridge', async () => {
  const client = fixture()
  try {
    const before = await client.invoke('credential_state', {}, page)
    const bridge = await client.invoke('skill_center_bridge_connect', {}, page)
    expect(typeof client.renewSession).toBe('function')
    await client.renewSession({ scope, accessToken: 'synthetic-renewed' })
    const after = await client.invoke('credential_state', {}, page)
    expect(after).toEqual({ ...before as object, renewals: 1 })
    expect(await client.invoke('skill_center_bridge_connect', {}, page)).toEqual(bridge)
  } finally { await client.dispose() }
})

it('denies a different account generation without changing the retained companion', async () => {
  const client = fixture()
  try {
    const before = await client.invoke('credential_state', {}, page)
    expect(typeof client.renewSession).toBe('function')
    await expect(client.renewSession({ scope: { ...scope, generation: 8 }, accessToken: 'synthetic-renewed' }))
      .rejects.toThrow('ACCOUNT_SCOPE_CHANGED')
    expect(await client.invoke('credential_state', {}, page)).toEqual(before)
  } finally { await client.dispose() }
})

it('waits for admitted Skill work before renewing and admits later work with the new credential', async () => {
  const client = fixture()
  try {
    await client.invoke('credential_state', {}, page)
    expect(typeof client.renewSession).toBe('function')
    const admitted = client.invoke('credential_hold', {}, page)
    await new Promise(resolve => setTimeout(resolve, 10))
    const renewal = client.renewSession({ scope, accessToken: 'synthetic-renewed' })
    const later = client.invoke('credential_state', {}, page)
    expect(await admitted).toMatchObject({ renewals: 0 })
    await renewal
    expect(await later).toMatchObject({ renewals: 1 })
  } finally { await client.dispose() }
})
