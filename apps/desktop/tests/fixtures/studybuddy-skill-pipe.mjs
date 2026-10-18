import { createInterface } from 'node:readline'
let scope
let renewals = 0
createInterface({ input: process.stdin }).on('line', line => {
  const frame = JSON.parse(line)
  if (!scope) {
    scope = frame.scope
    const ready = frame.accessToken === 'synthetic-ready-rejected' ? { schemaVersion: 1, ready: false, scope, error: { code: 'AUTH_REQUIRED' } } : { schemaVersion: 1, ready: true, scope }
    process.stdout.write(JSON.stringify(ready) + '\n'); return
  }
  if (Object.hasOwn(frame, 'accessToken')) {
    if (frame.scope.accountId !== scope.accountId || frame.scope.generation !== scope.generation) throw Error('wrong renewal scope')
    renewals++
    process.stdout.write(JSON.stringify({ schemaVersion: 1, requestId: frame.requestId, scope, data: null, error: null }) + '\n'); return
  }
  if (['credential_state', 'credential_hold'].includes(frame.command)) {
    const data = { pid: process.pid, renewals }
    const reply = () => process.stdout.write(JSON.stringify({ schemaVersion: 1, requestId: frame.requestId, scope, data, error: null }) + '\n')
    if (frame.command === 'credential_hold') setTimeout(reply, 50)
    else reply()
    return
  }
  if (frame.command === 'hang') return
  if (['skill_safety_inventory', 'skill_safety_snapshot'].includes(frame.command)) {
    if (frame.page !== 'studybuddy-native://skill-safety') throw new Error('unexpected public origin')
    const data = frame.command === 'skill_safety_inventory' ? { revision: 'scan_fixture', complete: true, instances: [] }
      : frame.input.action === 'verify' ? { current: true }
        : { directory: 'C:/synthetic/private-snapshot', revision: frame.input.revision, instanceId: frame.input.instanceId === 'instance_wrong' ? 'instance_unselected' : frame.input.instanceId,
          sourceDigest: 'b'.repeat(64), files: [{ relativePath: 'SKILL.md', sha256: 'a'.repeat(64), byteLength: 10 }],
          ...(frame.input.instanceId === 'instance_extra' ? { credential: 'synthetic-must-not-pass' } : {}) }
    process.stdout.write(JSON.stringify({ schemaVersion: 1, requestId: frame.requestId, scope, data, error: null }) + '\n'); return
  }
  if (frame.input.fixtureAuthExpired === true) {
    process.stdout.write(JSON.stringify({ schemaVersion: 1, requestId: frame.requestId, scope, data: null, error: { code: 'AUTH_REQUIRED' } }) + '\n'); return
  }
  if (frame.command === 'stale') {
    process.stdout.write(JSON.stringify({ schemaVersion: 1, requestId: frame.requestId, scope: { ...scope, generation: scope.generation + 1 }, data: null, error: null }) + '\n'); return
  }
  if (frame.input.onProgress) process.stdout.write(JSON.stringify({ schemaVersion: 1, kind: 'progress', scope, requestId: frame.requestId, channelId: frame.input.onProgress, payload: { original: 'progress' } }) + '\n')
  const data = frame.command === 'prepare'
    ? { entryUrl: 'https://guijitongzhuo.com/skills?embed=desktop#ticket=' + 'T'.repeat(43), bindingId: 'b'.repeat(64) }
    : frame.command === 'skill_center_bridge_connect' ? { bridgeSessionId: '11111111-1111-4111-8111-111111111111' }
    : frame.command === 'skill_center_scan' ? { revision: 'scan_1', instances: [], tools: [], scanErrors: [] }
    : frame.command === 'skill_center_watch_start' ? { watchId: '22222222-2222-4222-8222-222222222222' }
    : ['skill_center_watch_stop', 'skill_center_record_diagnostic'].includes(frame.command) ? null
    : { original: frame.command }
  process.stdout.write(JSON.stringify({ schemaVersion: 1, requestId: frame.requestId, scope, data, error: null }) + '\n')
})
