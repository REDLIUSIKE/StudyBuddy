import {expect,it,vi} from 'vitest'
import {CapabilityProjectNavigation} from '../../src/studybuddy/capabilities/navigation.ts'
import {caller,target} from './fixture.ts'
it('projectActionPreservesDraft by opening the existing page without creating or rewriting a Session',async()=>{
 let id='',draft='尚未发送的汽车广告修改',current=true
 const open=vi.fn(async()=>{}),navigation=new CapabilityProjectNavigation({assert:()=>{if(!current)throw Error('REVOKED')},notify:(_caller,_target,action)=>{id=action},open})
 const pending=navigation.open(caller,target,new AbortController().signal)
 await expect(navigation.complete(id,{...caller.scope,generation:0})).rejects.toThrow('CAPABILITY_OPEN_NOT_AUTHORIZED')
 expect(open).not.toHaveBeenCalled();await navigation.complete(id,caller.scope);await pending;expect(draft).toBe('尚未发送的汽车广告修改');expect(open).toHaveBeenCalledWith(caller,target,expect.any(AbortSignal))
 const lost=navigation.open(caller,target,new AbortController().signal);current=false;navigation.revoke();await expect(lost).rejects.toThrow('CAPABILITY_SCOPE_REVOKED')
})
