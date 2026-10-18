/** Explicit acceptance against the running local Electron candidate, without payments or probes. */
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {expect,it} from 'vitest'
it.skipIf(process.env.STUDYBUDDY_LIVE_DESKTOP!=='1')('retains the actual guest and opens the sole global balance action above it',async()=>{
  const result=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./fixtures/studybuddy-account-acceptance.mjs',import.meta.url))],{timeout:110_000,windowsHide:true,maxBuffer:32*1024})
  const receipt=JSON.parse(result.stdout.trim()) as {checks:string[];paymentCreated:boolean;modelProbe:boolean}
  expect(receipt.checks).toContain('overlay hides guest');expect(receipt.paymentCreated).toBe(false);expect(receipt.modelProbe).toBe(false)
})
