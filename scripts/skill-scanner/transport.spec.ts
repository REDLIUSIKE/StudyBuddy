import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, toNamespacedPath } from 'node:path'
import { runSkillScannerWorker } from './transport.ts'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function processFixture(body: string) {
  const root = await mkdtemp(join(tmpdir(), 'skill-scanner-pipe-')); roots.push(root)
  const entry = join(root, 'worker.mjs'); await writeFile(entry, body)
  return { executable: process.execPath, args: [entry], cwd: root }
}
it('relays actual judge frames once and preserves a high verdict process result', async () => {
  // An inert child validates pipe orchestration; upstream analyzer parity has a separate real-worker verifier.
  const process = await processFixture(`import readline from 'node:readline';
const input=readline.createInterface({input:process.stdin}); let count=0;
input.on('line',line=>{const v=JSON.parse(line); if(count++===0){if(v.kind!=='scan')process.exit(9);console.log(JSON.stringify({kind:'judge',id:'1',messages:[{role:'user',content:'inert evidence'}],maxTokens:64}));}
else {if(v.kind!=='judge-result'||v.id!=='1'||v.value.content!=='recorded')process.exit(8); console.log(JSON.stringify({kind:'result',value:{findings:[{rule_id:'REAL_RULE',severity:'HIGH',title:'Original finding',description:'Original evidence'}],analyzers_used:['static_analyzer','llm_analyzer'],analyzers_failed:[]}}));process.exit(1);}});`)
  let calls = 0
  const result = await runSkillScannerWorker({ ...process, signal: new AbortController().signal, input: { directory: 'owned-stage', model: 'exact-fixture' },
    judge: async () => { calls++; return { content: 'recorded', usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } } })
  expect(result.findings).toMatchObject([{ rule_id: 'REAL_RULE', severity: 'HIGH', title: 'Original finding' }]); expect(calls).toBe(1)
})
it.skipIf(process.platform !== 'win32')('Windows worker receives native long-path names without changing OS policy', async () => {
  const fixture = await processFixture(`import readline from 'node:readline';
readline.createInterface({input:process.stdin}).once('line',line=>{const v=JSON.parse(line); console.log(JSON.stringify({kind:'result',value:{findings:[],analyzers_used:[v.directory],analyzers_failed:[]}}));process.exit(0);});`)
  const result = await runSkillScannerWorker({ ...fixture, signal: new AbortController().signal,
    input: { directory: fixture.cwd, model: 'exact-fixture' }, judge: async () => { throw Error('NOT_CALLED') } })
  expect(result.analyzers_used).toEqual([toNamespacedPath(fixture.cwd)])
})
it('cancel_dispose_stops_the_actual_worker', async () => {
  const fixture = await processFixture(`import {writeFileSync} from 'node:fs'; writeFileSync('pid',String(process.pid)); console.log(JSON.stringify({kind:'ready'})); process.stdin.resume(); setInterval(()=>{},1000);`)
  const abort = new AbortController()
  const running = runSkillScannerWorker({ ...fixture, signal: abort.signal, input: { directory: 'owned-stage', model: 'exact-fixture' }, judge: async () => { throw Error('NOT_CALLED') } })
  let pid = 0
  await vi.waitFor(async () => { pid = Number(await readFile(join(fixture.cwd, 'pid'), 'utf8')); expect(pid).toBeGreaterThan(0) })
  abort.abort()
  await expect(running).rejects.toThrow('SKILL_SAFETY_CANCELLED')
  expect(() => process.kill(pid, 0)).toThrow()
})
it('rejects a result frame followed by an unknown crash instead of publishing success', async () => {
  const process = await processFixture(`console.log(JSON.stringify({kind:'result',value:{findings:[],analyzers_used:['static_analyzer','llm_analyzer'],analyzers_failed:[]}}));process.exit(7);`)
  await expect(runSkillScannerWorker({ ...process, signal: new AbortController().signal, input: { directory: 'owned-stage', model: 'exact-fixture' }, judge: async () => { throw Error('NOT_CALLED') } })).rejects.toThrow('SKILL_SAFETY_SCANNER_FAILED')
})
it('rejects oversized and credential-bearing judge frames without running inference', async () => {
  const process = await processFixture(`console.log(JSON.stringify({kind:'judge',id:'1',messages:[],maxTokens:64,apiKey:'must-not-be-relayed'}));process.stdin.resume();`)
  let calls = 0
  await expect(runSkillScannerWorker({ ...process, signal: new AbortController().signal, input: { directory: 'owned-stage', model: 'exact-fixture' }, judge: async () => { calls++; throw Error('NOT_CALLED') } })).rejects.toThrow('SKILL_SAFETY_SCANNER_INVALID')
  expect(calls).toBe(0)
})
it('cancels the child even when a judge callback is still pending', async () => {
  const fixture = await processFixture(`console.log(JSON.stringify({kind:'judge',id:'1',messages:[{role:'user',content:'inert'}],maxTokens:64}));process.stdin.resume();setInterval(()=>{},1000);`)
  const abort = new AbortController()
  let entered!: () => void, release!: (value: { content: string; usage: { input_tokens: number; output_tokens: number; total_tokens: number } }) => void
  const started = new Promise<void>(accept => { entered = accept })
  const running = runSkillScannerWorker({ ...fixture, signal: abort.signal, input: { directory: 'owned-stage', model: 'exact-fixture' },
    judge: () => { entered(); return new Promise(accept => { release = accept }) } })
  await started; abort.abort()
  try { await expect(running).rejects.toThrow('SKILL_SAFETY_CANCELLED') }
  finally { release({ content: 'late result must not publish', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }) }
})
