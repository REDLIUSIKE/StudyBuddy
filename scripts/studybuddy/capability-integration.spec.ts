import {it,expect} from 'vitest'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
it('compiles the native capability pipeline, transfers original AIGC and third-module bytes, edits with revisions and decodes the actual export',async()=>{
 const runner=fileURLToPath(new URL('../../../output/capability-orchestration-20261017/integration-runner.mjs',import.meta.url))
 const result=await promisify(execFile)(process.execPath,['--experimental-transform-types','--experimental-vm-modules',runner],{windowsHide:true,timeout:180000,maxBuffer:2*1024*1024})
 const report=JSON.parse(result.stdout.trim().split('\n').at(-1)!)
 expect(report).toMatchObject({nativeSession:true,compiledDomains:true,thirdModule:true,asyncNode:true,originalBytes:true,revisionConflict:true,exportDecoded:true,paidCalls:0})
},190000)
