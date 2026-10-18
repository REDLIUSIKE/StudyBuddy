import { it,expect } from 'vitest'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import { VideoPageController } from '../src/client/video-controller.ts'
it('drops an explicitly closed project reference while retaining other project histories and rejecting stale close notices',async()=>{
 const scope={accountId:'account',generation:1},released:string[]=[]
 const host={acquire:async()=>({lease:'lease',partition:'p',entryUrl:'http://127.0.0.1:1/',scope}),release:async()=>{},setTheme:async()=>{}}
 const controller=new VideoPageController(host,id=>({sessionId:id,release:()=>{released.push(id)}}) as SessionReference)
 controller.setScope(scope);await controller.page.acquire()
 for(const [projectId,sessionId,revision] of [['first','session-1',1],['second','session-2',2]] as const)controller.accept({scope,lease:'lease',kind:'project',projectId,sessionId,revision})
 expect(controller.accept({scope,lease:'lease',kind:'library',closedProjectId:'second',revision:3})).toBe(true)
 expect(released).toEqual(['session-2'])
 expect(controller.getSnapshot().views.map(view=>[view.projectId,view.selected])).toEqual([['first',false]])
 expect(controller.accept({scope,lease:'lease',kind:'library',closedProjectId:'first',revision:2})).toBe(false)
 expect(released).toEqual(['session-2'])
 controller.dispose();expect(released).toEqual(['session-2','session-1'])
})
it('retains project Sessions, switches the visible one and releases them on account change',async()=>{
 const scope={accountId:'account',generation:1},released:string[]=[]
 const host={acquire:async()=>({lease:'video-lease',partition:'video-test',entryUrl:'http://127.0.0.1:1/',scope}),release:async()=>{},setTheme:async()=>{}}
 const controller=new VideoPageController(host,id=>({sessionId:id,release:()=>{released.push(id)}}) as SessionReference)
 controller.setScope(scope);await controller.page.acquire()
 const event=(projectId:string,sessionId:string,revision:number)=>({lease:'video-lease',scope,revision,kind:'project',projectId,sessionId})
 expect(controller.accept(event('first','session-1',1))).toBe(true)
 expect(controller.accept(event('second','session-2',2))).toBe(true)
 expect(controller.getSnapshot().views.map(view=>[view.projectId,view.selected])).toEqual([['first',false],['second',true]])
 controller.setScope({...scope,generation:2})
 expect(released.sort()).toEqual(['session-1','session-2'])
 expect(controller.getSnapshot().views).toEqual([])
 controller.dispose()
})
it('rejects old leases, foreign accounts, stale project changes and references to unbound Sessions',async()=>{
 const scope={accountId:'account',generation:1}
 const host={acquire:async()=>({lease:'lease',partition:'p',entryUrl:'http://127.0.0.1:1/',scope}),release:async()=>{},setTheme:async()=>{}}
 const controller=new VideoPageController(host,id=>({sessionId:id,release:()=>{}}) as SessionReference)
 controller.setScope(scope);await controller.page.acquire()
 const message={scope,lease:'lease',revision:2,kind:'project',projectId:'project',sessionId:'session'}
 expect(controller.accept(message)).toBe(true)
 expect(controller.accept({...message,revision:1})).toBe(false)
 expect(controller.accept({...message,scope:{accountId:'other',generation:1},revision:3})).toBe(false)
 expect(controller.accept({...message,lease:'old',revision:3})).toBe(false)
 expect(controller.accept({...message,kind:'reference',sessionId:'not-bound',revision:3,id:'ref',text:'frame at 1',files:[]})).toBe(false)
 controller.dispose()
})
