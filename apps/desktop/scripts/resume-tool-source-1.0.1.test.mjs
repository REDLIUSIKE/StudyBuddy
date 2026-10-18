import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireCheckpoint, requirePreparedCheckpoint, requirePackagedCheckpoint, executeSigningPhases } from './resume-tool-source-1.0.1.mjs'
const run={target:'win-x64',version:'1.0.1',unsigned:false}
const stages=['run build:official','exec tsx scripts/pack-private-runtime.ts','run prepare:runtime --defer-primary-runtime-smoke','run sign:primary-runtime','run prepare:packages'].map(stage=>({stage,code:0}))
const result={success:false,stages:[...stages,{stage:'run prepare:dsh --defer-runtime-smoke',code:1}]}
test('resume accepts the exact failed stage only after required preparation passes',()=>assert.doesNotThrow(()=>requireCheckpoint(run,result)))
test('resume rejects another version and missing or failed prerequisites',()=>{
  assert.throws(()=>requireCheckpoint({...run,version:'1.0.0'},result))
  assert.throws(()=>requireCheckpoint(run,{...result,stages:result.stages.slice(1)}))
  assert.throws(()=>requireCheckpoint(run,{...result,stages:result.stages.map(row=>row.stage==='run build:official'?{...row,code:1}:row)}))
  assert.throws(()=>requireCheckpoint(run,{...result,success:true}))
})

test('prepared runtime resume requires both successful stages and the exact interrupted signing stage',()=>{
  const checkpoint={target:'win-x64',version:'1.0.1',buildId:'e26f6b65b6a648e28f7d85d1ac88327a'}
  const result={success:false,stages:[{stage:'repair:core-package-set',code:0},{stage:'repair:dsh-runtime',code:0},{stage:'repair:runtime-signatures',code:1}]}
  assert.doesNotThrow(()=>requirePreparedCheckpoint(checkpoint,result))
  assert.throws(()=>requirePreparedCheckpoint(checkpoint,{...result,stages:result.stages.slice(1)}))
  assert.throws(()=>requirePreparedCheckpoint({...checkpoint,buildId:'another'},result))
})

test('runtime signer owns its lock; only artifact signing receives the outer lock',async()=>{
  let held=false
  const order=[]
  await executeSigningPhases(async(name)=>{
    if(name==='repair:runtime-signatures')assert.equal(held,false,'nested process lock would deadlock')
    if(name==='repair:windows-artifacts')assert.equal(held,true)
    order.push(name)
  },async(operation)=>{held=true;try{await operation()}finally{held=false}})
  assert.deepEqual(order,['repair:runtime-signatures','repair:windows-artifacts'])
})

test('installer resume retains only the exact candidate with verified runtime signing',()=>{
  const run={target:'win-x64',version:'1.0.1',buildId:'e26f6b65b6a648e28f7d85d1ac88327a'}
  const result={success:false,stages:[{stage:'repair:runtime-signatures',code:0},{stage:'repair:windows-artifacts',code:1}]}
  assert.doesNotThrow(()=>requirePackagedCheckpoint(run,result))
  assert.throws(()=>requirePackagedCheckpoint(run,{...result,stages:[{stage:'repair:runtime-signatures',code:1},{stage:'repair:windows-artifacts',code:1}]}))
  assert.throws(()=>requirePackagedCheckpoint({...run,version:'1.0.2'},result))
})
