import { expect,it,vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { BrowserWindow,Session,WebContents } from 'electron'
import { StudyBuddyEmbeddedGuests,validateProfileEntry,profileNavigationAllowed,validateEmbeddedTheme } from '../src/studybuddy/embedded-guests.ts'
import type { MainSession } from '../src/studybuddy/services.ts'

it('keeps theme and repeated geometry notifications separate from Skill page resume, and restores lifecycle after navigation',async()=>{
  const scope={accountId:'fixture-skills-visibility',generation:1},owner=Object.assign(new EventEmitter(),{id:74,isDestroyed:()=>false}) as WebContents
  const browserSession=Object.assign(Object.create(null) as Session,{setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},setDisplayMediaRequestHandler(){},on(){},webRequest:{onBeforeRequest(){}},clearStorageData:async()=>{},clearCache:async()=>{}})
  const entry='https://guijitongzhuo.com/skills',auth={scope:()=>scope,withSession:async<T>(run:(session:MainSession)=>Promise<T>)=>run({scope,accessToken:'synthetic-skill-access'})}
  const manager=new StudyBuddyEmbeddedGuests(auth,vi.fn(),()=>browserSession,undefined,undefined,{target:'skills',validateEntry:value=>String(value),navigationAllowed:value=>value===entry,issue:async()=>({entryUrl:entry})})
  const lease=await manager.acquire(owner)
  let url='about:blank#studybuddy-skills-'+lease.lease
  const execute=vi.fn(async(_script:string,_userGesture?:boolean)=>undefined)
  const guest=Object.assign(new EventEmitter(),{getURL:()=>url,isDestroyed:()=>false,executeJavaScript:execute,setWindowOpenHandler:vi.fn(),close(){guest.emit('destroyed')}}) as unknown as WebContents
  manager.bind({webContents:owner} as BrowserWindow,()=>()=>{},()=>false)
  owner.emit('did-attach-webview',{},guest);guest.emit('dom-ready');url=entry
  await manager.setVisible(owner,lease.lease,true);await manager.setVisible(owner,lease.lease,true)
  await manager.setTheme(owner,lease.lease,{mode:'light',variables:{}});await manager.setTheme(owner,lease.lease,{mode:'dark',variables:{}})
  const lifecycle=(event:string)=>execute.mock.calls.filter(([script])=>String(script).includes(event)).length
  expect(lifecycle('studybuddy:embedded-resume')).toBe(1)
  await manager.setVisible(owner,lease.lease,false);await manager.setVisible(owner,lease.lease,false)
  expect(lifecycle('studybuddy:embedded-suspend')).toBe(1)
  guest.emit('did-start-navigation',{},entry,false,true);guest.emit('did-finish-load')
  await new Promise(resolve=>setTimeout(resolve,0))
  expect(lifecycle('studybuddy:embedded-suspend')).toBe(2)
  await manager.revoke()
})

it('keeps profile and model insights in separate one-time ticket partitions for the same window',async()=>{
  const scope={accountId:'fixture-models',generation:1},owner=Object.assign(new EventEmitter(),{id:73,isDestroyed:()=>false}) as WebContents
  const cleared:string[]=[],sessions:Session[]=[]
  const auth={scope:()=>scope,withSession:async<T>(run:(session:MainSession)=>Promise<T>)=>run({scope,accessToken:'synthetic-models-access'})}
  let issued=0
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({entryUrl:'https://guijitongzhuo.com/my-ai/profile?embed=desktop#ticket='+String(++issued).repeat(43)})))
  const manager=new StudyBuddyEmbeddedGuests(auth,fetcher,partition=>{
    const session=Object.assign(Object.create(null) as Session,{setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},setDisplayMediaRequestHandler(){},on(){},webRequest:{onBeforeRequest(){}},clearStorageData:async()=>{cleared.push(partition)},clearCache:async()=>{}})
    sessions.push(session);return session
  })
  const [profile,models,duplicate]=await Promise.all([manager.acquire(owner),manager.acquire(owner,'models'),manager.acquire(owner,'models')])
  expect(models.lease).not.toBe(profile.lease);expect(models.partition).not.toBe(profile.partition)
  expect(duplicate).toBe(models);expect(fetcher).toHaveBeenCalledTimes(2)
  expect(new URL(profile.entryUrl).searchParams.has('view')).toBe(false)
  expect(new URL(models.entryUrl).searchParams.get('view')).toBe('models')
  expect(await manager.acquire(owner,'models')).toBe(models)
  expect(()=>validateProfileEntry(models.entryUrl)).toThrow('PROFILE_ENTRY_INVALID')
  await manager.release(owner,models.lease)
  expect(manager.owns(owner,profile.lease)).toBe(true)
  await manager.revoke();expect(cleared).toHaveLength(2);expect(sessions).toHaveLength(2)
})

it('waits for the Skill process exit even when browser storage cleanup rejects',async()=>{
  const scope={ accountId:'fixture-cleanup',generation:1 }
  const owner=Object.assign(new EventEmitter(),{ id:31,isDestroyed:()=>false }) as WebContents
  let finishNative!:()=>void
  const nativeExit=new Promise<void>((resolve)=>{finishNative=resolve})
  const failure=new Error('STORAGE_CLEANUP_FAILED')
  const dispose=vi.fn(()=>nativeExit)
  const browserSession=Object.assign(Object.create(null) as Session,{
    setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},
    setDisplayMediaRequestHandler(){},on(){},webRequest:{ onBeforeRequest(){} },
    clearStorageData:async()=>{throw failure},clearCache:async()=>{},
  })
  const auth={ scope:()=>scope,withSession:async<T>(run:(session:MainSession)=>Promise<T>)=>
    run({ scope,accessToken:'synthetic-cleanup-access' }) }
  const entryUrl='https://guijitongzhuo.com/my-ai/profile?embed=desktop#ticket='+'a'.repeat(43)
  const manager=new StudyBuddyEmbeddedGuests(auth,async()=>{throw Error('PUBLIC_API_FORBIDDEN')},
    ()=>browserSession,undefined,undefined,{
      target:'skills',validateEntry:validateProfileEntry,navigationAllowed:profileNavigationAllowed,
      issue:async()=>({ entryUrl,dispose }),
    })
  const lease=await manager.acquire(owner)
  let settled=false
  const cleanup=manager.release(owner,lease.lease).then(()=>{settled=true;return null},
    (error)=>{settled=true;return error})
  try{
    await vi.waitFor(()=>expect(dispose).toHaveBeenCalledOnce())
    await new Promise<void>(resolve=>setImmediate(resolve))
    expect(settled).toBe(false)
  }finally{finishNative();await cleanup}
  expect(await cleanup).toBe(failure)
})
it('revocation waits for every Skill process after a different lease cleanup fails',async()=>{
  const scope={ accountId:'fixture-revoke-cleanup',generation:1 }
  const owners=[41,42].map(id=>Object.assign(new EventEmitter(),{ id,isDestroyed:()=>false }) as WebContents)
  let finishFirst!:()=>void,finishSecond!:()=>void,issued=0
  const firstExit=new Promise<void>((resolve)=>{finishFirst=resolve}),
    secondExit=new Promise<void>((resolve)=>{finishSecond=resolve})
  const disposals=[vi.fn(()=>firstExit),vi.fn(()=>secondExit)]
  const failure=new Error('FIRST_STORAGE_CLEANUP_FAILED')
  const browserSession=Object.assign(Object.create(null) as Session,{
    setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},
    setDisplayMediaRequestHandler(){},on(){},webRequest:{ onBeforeRequest(){} },
    clearStorageData:async()=>{throw failure},clearCache:async()=>{},
  })
  const auth={ scope:()=>scope,withSession:async<T>(run:(session:MainSession)=>Promise<T>)=>
    run({ scope,accessToken:'synthetic-revoke-access' }) }
  const entryUrl='https://guijitongzhuo.com/my-ai/profile?embed=desktop#ticket='+'a'.repeat(43)
  const manager=new StudyBuddyEmbeddedGuests(auth,async()=>{throw Error('PUBLIC_API_FORBIDDEN')},
    ()=>browserSession,undefined,undefined,{
      target:'skills',validateEntry:validateProfileEntry,navigationAllowed:profileNavigationAllowed,
      issue:async()=>{
        const dispose=disposals[issued++]
        if(!dispose)throw Error('UNEXPECTED_SKILL_LEASE')
        return { entryUrl,dispose }
      },
    })
  await Promise.all(owners.map(owner=>manager.acquire(owner)))
  let settled=false
  const cleanup=manager.revoke().then(()=>{settled=true;return null},(error)=>{settled=true;return error})
  try{
    await vi.waitFor(()=>{for(const dispose of disposals)expect(dispose).toHaveBeenCalledOnce()})
    finishFirst()
    await new Promise<void>(resolve=>setImmediate(resolve))
    expect(settled).toBe(false)
  }finally{finishFirst();finishSecond();await cleanup}
  expect(await cleanup).toBe(failure)
})
it('carries only owned growth exports and invalidation, wiping the expired lease before notifying its owner',async()=>{
  const scope={ accountId:'fixture-a',generation:1 },owner=Object.assign(new EventEmitter(),{ id:12,isDestroyed:()=>false }) as WebContents
  const steps:string[]=[],browserSession=Object.assign(Object.create(null) as Session,{ setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},setDisplayMediaRequestHandler(){},on(){},webRequest:{ onBeforeRequest(){} },clearStorageData:async()=>{steps.push('storage')},clearCache:async()=>{steps.push('cache')} })
  const auth={ scope:()=>scope,withSession:async<T>(run:(session:MainSession)=>Promise<T>)=>run({ scope,accessToken:'synthetic-access' }) }
  let finish!:(result:'cancelled')=>void
  const save=vi.fn(()=>new Promise<'cancelled'>((resolve)=>{finish=resolve})),invalid=vi.fn(()=>steps.push('invalid'))
  const manager=new StudyBuddyEmbeddedGuests(auth,async()=>new Response(JSON.stringify({ entryUrl:'https://guijitongzhuo.com/my-ai/profile?embed=desktop#ticket='+'a'.repeat(43) })),()=>browserSession,save,invalid)
  const lease=await manager.acquire(owner),src='about:blank#studybuddy-profile-'+lease.lease
  manager.bind({ webContents:owner } as BrowserWindow,()=>()=>{},()=>false)
  owner.emit('will-attach-webview',{ preventDefault:vi.fn() },{},{ src,partition:lease.partition })
  let url=src,destroyed=false
  const guest=Object.assign(Object.create(EventEmitter.prototype) as WebContents,new EventEmitter(),{ getURL:()=>url,isDestroyed:()=>destroyed,close:()=>{steps.push('close');destroyed=true;guest.emit('destroyed')},setWindowOpenHandler:vi.fn(),executeJavaScript:vi.fn(async()=>{}) })
  owner.emit('did-attach-webview',{},guest);guest.emit('dom-ready');url='https://guijitongzhuo.com/my-ai/profile?embed=desktop&host_ui=harness'
  const version='55555555-5555-4555-8555-555555555555',event={ isMainFrame:true,url:'studybuddy://personal-profile/save-growth?version='+version,preventDefault:vi.fn() }
  guest.emit('will-frame-navigate',event);guest.emit('will-frame-navigate',event);expect(save).toHaveBeenCalledExactlyOnceWith(owner,version);expect(event.preventDefault).toHaveBeenCalledTimes(2)
  finish('cancelled');await vi.waitFor(()=>expect(guest.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('"status":"cancelled"'),false))
  guest.emit('will-frame-navigate',{ isMainFrame:true,url:'studybuddy://embedded-page/invalid?extra=1',preventDefault:vi.fn() });expect(invalid).not.toHaveBeenCalled()
  guest.emit('will-frame-navigate',{ isMainFrame:true,url:'studybuddy://embedded-page/invalid',preventDefault:vi.fn() })
  await vi.waitFor(()=>expect(invalid).toHaveBeenCalledExactlyOnceWith(owner,lease.lease));expect(steps).toEqual(['close','storage','cache','invalid']);expect(manager.recognizes(owner,src,lease.partition)).toBe(false)
  expect((await manager.acquire(owner)).lease).not.toBe(lease.lease)
})
it('admits only the original profile ticket route and never another origin or a missing ticket',()=>{
  const entry='https://guijitongzhuo.com/my-ai/profile?embed=desktop#ticket='+'a'.repeat(43)
  expect(validateProfileEntry(entry)).toContain('host_ui=harness')
  expect(()=>validateProfileEntry(entry.replace('guijitongzhuo.com','malicious.example'))).toThrow('PROFILE_ENTRY_INVALID')
  expect(()=>validateProfileEntry(entry.split('#')[0])).toThrow('PROFILE_ENTRY_INVALID')
  expect(profileNavigationAllowed('https://guijitongzhuo.com/my-ai/profile?embed=desktop')).toBe(true)
  expect(profileNavigationAllowed('https://guijitongzhuo.com/api/v1/auth')).toBe(false)
  expect(profileNavigationAllowed('http://127.0.0.1:9230/')).toBe(false)
})
it('accepts resolved Harness tokens and refuses scripts, URLs, unrelated properties and theme mode guesses',()=>{
  expect(validateEmbeddedTheme({ mode:'dark',variables:{ '--dsw-alias-label-primary':'rgb(255, 255, 255)','--dsh-content-font-size-secondary':'13px' } }).mode).toBe('dark')
  for(const theme of [{ mode:'system',variables:{} },{ mode:'light',variables:{ '--dsw-alias-bg-base':'url(https://example.com)' } },{ mode:'light',variables:{ onclick:'alert(1)' } }])expect(()=>validateEmbeddedTheme(theme)).toThrow('PROFILE_THEME_INVALID')
})
it('owns attachment by window and scope, then waits for guest destruction before clearing storage',async()=>{
  let scope:MainSession['scope']|null={ accountId:'fixture-a',generation:1 }
  const owner=Object.assign(new EventEmitter(),{ id:1,isDestroyed:()=>false }) as WebContents
  const stranger=Object.assign(new EventEmitter(),{ id:2,isDestroyed:()=>false }) as WebContents
  const cleared:string[]=[],browserSession=Object.assign(Object.create(null) as Session,{ setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},setDisplayMediaRequestHandler(){},on(){},webRequest:{ onBeforeRequest(){} },clearStorageData:async()=>{cleared.push('storage')},clearCache:async()=>{cleared.push('cache')} })
  const auth={ scope:()=>scope,withSession:async<T>(run:(session:MainSession)=>Promise<T>)=>{if(!scope)throw new Error('AUTH_REQUIRED');return run({ scope,accessToken:'synthetic-access' })} }
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({ entryUrl:'https://guijitongzhuo.com/my-ai/profile?embed=desktop#ticket='+'a'.repeat(43) }),{ status:200 }))
  const manager=new StudyBuddyEmbeddedGuests(auth,fetcher,()=>browserSession)
  const lease=await manager.acquire(owner),src='about:blank#studybuddy-profile-'+lease.lease
  expect(await manager.acquire(owner)).toBe(lease);expect(fetcher).toHaveBeenCalledTimes(1)
  expect(manager.recognizes(stranger,src,lease.partition)).toBe(false)
  manager.bind({ webContents:owner } as BrowserWindow,()=>()=>{},()=>false)
  const rejected={ preventDefault:vi.fn() },wrongPreferences={ preload:'malicious' }
  owner.emit('will-attach-webview',rejected,wrongPreferences,{ src,partition:'wrong' });expect(rejected.preventDefault).toHaveBeenCalledOnce()
  const admitted={ preventDefault:vi.fn() },preferences={ preload:'malicious' }
  owner.emit('will-attach-webview',admitted,preferences,{ src,partition:lease.partition });expect(admitted.preventDefault).not.toHaveBeenCalled();expect(preferences).toMatchObject({ nodeIntegration:false,sandbox:true,contextIsolation:true });expect(preferences).not.toHaveProperty('preload')
  let destroyed=false
  const guest=Object.assign(Object.create(EventEmitter.prototype) as WebContents,new EventEmitter(),{
    getURL:()=>src,isDestroyed:()=>destroyed,close:vi.fn(),setWindowOpenHandler:vi.fn(),
  })
  owner.emit('did-attach-webview',{},guest);guest.emit('dom-ready')
  await expect(manager.release(stranger,lease.lease)).rejects.toThrow('PROFILE_OWNER_MISMATCH')
  scope=null;const cleanup=manager.revoke()
  expect(manager.recognizes(owner,src,lease.partition)).toBe(false)
  expect(guest.close).toHaveBeenCalledOnce();expect(cleared).toEqual([])
  destroyed=true;guest.emit('destroyed');await cleanup;expect(cleared.sort()).toEqual(['cache','storage'])
})
