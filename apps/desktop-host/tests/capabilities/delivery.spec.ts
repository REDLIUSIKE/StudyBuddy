import {expect,it} from 'vitest'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import FsLocal from '@deepseek-ai/dsh-fs-local'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import * as Present from '@deepseek-ai/dsh-tool-present'
import {SessionId} from '@deepseek-ai/dsh-session'
import {fixture,owner} from './fixture.ts'
import * as capabilities from '../../src/capabilities/index.ts'
import {createCapabilityNativeDelivery} from '../../src/capabilities/delivery.ts'
it('loads original present in the actual invoking Session and emits its native delivery event',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cap-native-present-')),f=await fixture()
 try{
  await f.ctx.plugin(FsLocal);await f.ctx.plugin(WorkingDirectory)
  const actor=(await f.ctx.agents.create({sessionId:SessionId('session-native-delivery'),meta:{cwd:root},agentOptions:{}})).agent
  actor.session.append('turn/start',{turn:1})
  const file=join(root,'成片.txt');await writeFile(file,'verified bytes')
  const delivery=createCapabilityNativeDelivery(f.ctx,async()=>Present)
  const fiber=await f.ctx.plugin(capabilities,{owner:()=>owner,prepareDelivery:delivery.prepare,port:{invoke:async()=>({data:{files:[{path:file}]},artifacts:[],operationRef:null})},authorize:async()=>{}})
  actor.ctx.tools.restrict({allow:['creative_project','creative_import']})
  expect(f.ctx.tools.get('present',actor)).toBeUndefined()
  expect((await f.call('creative_project',{action:'deliver',artifactRef:'verified-artifact'},actor)).isError).toBe(false)
  expect(f.ctx.tools.get('present',actor)).toBeDefined();expect(f.ctx.tools.get('present',f.other)).toBeUndefined()
  expect(actor.session.snapshotEvents().filter(v=>v.type==='deliverables/presented')).toHaveLength(1)
  await fiber.dispose();await delivery.close()
  expect(f.ctx.tools.get('present',actor)).toBeUndefined()
 }finally{await f.close();await rm(root,{recursive:true,force:true})}
})
