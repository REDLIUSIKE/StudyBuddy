import {it,expect} from 'vitest'
it('rejects stale invalidations and obtains a fresh lease after the current embedded login expires',async()=>{
  let invalid:(lease:string)=>void=()=>{},opened=0,disposed=false
  const scope={accountId:'fixture',generation:1}
  const controller=new ProfileController({acquire:async()=>({lease:'lease-'+ ++opened,partition:'partition-'+opened,entryUrl:'https://guijitongzhuo.com/my-ai/profile',scope}),release:async()=>{},setTheme:async()=>{},subscribeInvalid:listener=>{invalid=listener;return()=>{disposed=true}}})
  controller.setScope(scope);await controller.acquire();invalid('obsolete');expect(controller.getSnapshot().lease?.lease).toBe('lease-1')
  invalid('lease-1');expect(controller.getSnapshot()).toMatchObject({lease:null,errorCode:'AUTH_REQUIRED'})
  await controller.retry();expect(controller.getSnapshot()).toMatchObject({lease:{lease:'lease-2'},errorCode:null})
  controller.dispose();expect(disposed).toBe(true)
})
import {ProfileController} from '../src/client/profile-controller.ts'
it('acquires the fixed model insights target and releases its own lease on logout',async()=>{
  const acquired:string[]=[],released:string[]=[],scope={accountId:'fixture',generation:1}
  const controller=new ProfileController({acquire:async target=>{acquired.push(target);return {lease:'models',partition:'models-partition',entryUrl:'https://guijitongzhuo.com/my-ai/profile?view=models',scope}},release:async lease=>{released.push(lease)},setTheme:async()=>{}},'model_insights')
  controller.setScope(scope);await controller.acquire();await controller.acquire()
  expect(acquired).toEqual(['model_insights'])
  controller.setScope(null);expect(controller.getSnapshot().lease).toBeNull();expect(released).toEqual(['models'])
  controller.dispose()
})
it('keeps a login-scoped lease and releases an acquisition that arrives after account replacement',async()=>{
  let finish:(value:{lease:string;partition:string;entryUrl:string;scope:{accountId:string;generation:number}})=>void=()=>{}
  const released:string[]=[]
  const controller=new ProfileController({acquire:()=>new Promise(resolve=>{finish=resolve}),release:async lease=>{released.push(lease)},setTheme:async()=>{}})
  const first={accountId:'a',generation:1};controller.setScope(first)
  const opening=controller.acquire()
  controller.setScope({accountId:'b',generation:2})
  finish({lease:'old',partition:'old-partition',entryUrl:'https://guijitongzhuo.com/my-ai/profile?embed=desktop&host_ui=harness',scope:first});await opening
  expect(released).toEqual(['old']);expect(controller.getSnapshot().lease).toBeNull()
  controller.dispose()
})
