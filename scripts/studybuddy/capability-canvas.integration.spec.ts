import {expect,it} from 'vitest'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
const execute=promisify(execFile)
it('runs the compiled AIGC domain and actual canvas with one background controller',async()=>{
 const root=fileURLToPath(new URL('../../../',import.meta.url)),runner=fileURLToPath(new URL('../../../output/capability-orchestration-20261017/canvas-integration-runner.mjs',import.meta.url))
 const result=await execute(process.execPath,['--experimental-transform-types','--experimental-vm-modules',runner,root],{windowsHide:true,timeout:120000,maxBuffer:2*1024*1024})
 const report=JSON.parse(result.stdout.trim().split('\n').at(-1)!)
 expect(report).toMatchObject({ordinaryCaller:true,videoCaller:true,singleController:true,canvasReady:true,manualConflict:true,saved:true,paidCalls:0})
},130000)
