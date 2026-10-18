// @vitest-environment jsdom
import {Context,Service} from '@deepseek-ai/cordis'
import {it,expect,vi,onTestFinished,afterEach} from 'vitest'
import {cleanup} from '@testing-library/react'
import {SlotRegistry} from '@deepseek-ai/dsh-client-ui-renderer/client'
import {LocaleRuntime} from '@deepseek-ai/dsh-client-locale/client'
import {createSnapshotStore} from '@deepseek-ai/dsh-client-store'
import type {PanelInfo,ILayout} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {AccountHost} from '../src/client/business-api.ts'
import type {AccountFace} from '../src/client/face.ts'
import * as accountPlugin from '../src/client/index.ts'
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('shares the account domain across real slot registrations and releases every contribution on reload',async()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
  type HostState=Awaited<ReturnType<AccountHost['status']>>
  let state:HostState={phase:'authenticated',scope:{accountId:'fixture-account',generation:1}}
  const listeners=new Set<(next:HostState)=>void>()
  const polls:Array<()=>void>=[]
  const interval=window.setInterval.bind(window),clearInterval=window.clearInterval.bind(window)
  vi.spyOn(window,'setInterval').mockImplementation((callback,delay,...args)=>{
    if(delay!==7000)return interval(callback,delay,...args) as unknown as NodeJS.Timeout
    if(typeof callback==='function')polls.push(()=>callback());return -polls.length as unknown as NodeJS.Timeout
  })
  const stopPoll=vi.spyOn(window,'clearInterval').mockImplementation(id=>{if(typeof id==='number'&&id>=0)clearInterval(id)})
  let availableBalance='9.1234567'
  const released:string[]=[]
  const host:AccountHost={status:async()=>state,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},business:{invoke:vi.fn(async(method:string)=>{
    if(method==='getAiAccountSummary')return {balance:'10.1234567',availableBalance,frozenBalance:'1',platformAccess:null}
    throw new Error('UNUSED_FIXTURE_OPERATION')
  }) as NonNullable<AccountHost['business']>['invoke']},embedded:{
    acquire:async target=>({lease:target,partition:'fixture-'+target,entryUrl:'https://guijitongzhuo.com/my-ai/profile?embed=desktop',scope:state.scope!}),
    release:async lease=>{released.push(lease)},setTheme:async()=>{},
  }}
  vi.stubGlobal('studybuddy',host)
  const ctx=new Context();onTestFinished(async()=>{await ctx.fiber.dispose()})
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale',new LocaleRuntime(ctx))
  new class extends Service{constructor(){super(ctx,'localeHolder')}}()
  const panelInfo=createSnapshotStore<PanelInfo>({activePanelId:null})
  ctx.provide('layout',{panelInfo,selectPanel:(activePanelId)=>panelInfo.set({activePanelId}),beginNavigation:()=>new AbortController().signal,toggleSidebar:()=>{},collapseSidebar:()=>{},openRightbar:()=>{},closeRightbar:()=>{}} satisfies ILayout)
  ctx.provide('theme',{getTheme:()=>({active:{colorScheme:'light'}})} as never)
  const fiber=ctx.plugin(accountPlugin,{balanceRefreshIntervalMs:7000});await fiber.await()
  const removeRoot=ctx.slots.register({name:'root',children:{main:{kind:'keyed',scope:'root'},'shell.actions':{kind:'list',scope:'root'},'sidebar.panellist':{kind:'list',scope:'root'},'settings.section':{kind:'list',scope:'root'}}} as never,()=>null)
  const main=ctx.slots.entries('main')[0]!,wallet=ctx.slots.entries('shell.actions')[0]!
  const mainFace:object=main.inject!(),walletFace:object=wallet.inject!()
  const face=mainFace as AccountFace,global=walletFace as AccountFace
  expect(face.hooks.account).toBe(global.hooks.account)
  const modelSettings=ctx.slots.entries('settings.section').find(entry=>entry.options.id==='models')!
  expect(modelSettings).toBeDefined()
  expect(modelSettings.options.priority).toBeLessThan(0)
  expect((modelSettings.inject!() as unknown as AccountFace).hooks.source).toBe(face.hooks.source)
  await vi.waitFor(()=>expect(face.hooks.account.getSnapshot().summary?.availableBalance).toBe('9.1234567'))
  expect(polls).toHaveLength(1)
  availableBalance='8.1234567';polls[0]!()
  await vi.waitFor(()=>expect(global.hooks.account.getSnapshot().summary?.availableBalance).toBe('8.1234567'))
  availableBalance='7.1234567';window.dispatchEvent(new Event('focus'))
  await vi.waitFor(()=>expect(global.hooks.account.getSnapshot().summary?.availableBalance).toBe('7.1234567'))
  vi.spyOn(document,'hidden','get').mockReturnValue(true)
  const reads=vi.mocked(host.business!.invoke).mock.calls.length
  polls[0]!();expect(vi.mocked(host.business!.invoke).mock.calls).toHaveLength(reads)
  vi.spyOn(document,'hidden','get').mockReturnValue(false)
  availableBalance='6.1234567';document.dispatchEvent(new Event('visibilitychange'))
  await vi.waitFor(()=>expect(global.hooks.account.getSnapshot().summary?.availableBalance).toBe('6.1234567'))
  expect(listeners.size).toBe(1)
  await vi.waitFor(()=>expect(face.hooks.modelInsights.getSnapshot().lease?.lease).toBe('model_insights'),{timeout:3500})
  expect(panelInfo.getSnapshot().activePanelId).toBeNull()
  const prepared=face.hooks.modelInsights.getSnapshot().lease
  face.activate('models')
  await vi.waitFor(()=>expect(face.hooks.modelInsights.getSnapshot().lease).toBe(prepared))
  state={phase:'authenticated',scope:{accountId:'other-fixture',generation:2}}
  for(const listener of listeners)listener(state)
  expect(stopPoll).toHaveBeenCalledWith(-1)
  expect(face.hooks.source.getSnapshot().draft).toBeNull()
  expect(face.hooks.modelInsights.getSnapshot()).toMatchObject({scope:state.scope,lease:null})
  expect(released).toContain('model_insights')
  removeRoot();expect(ctx.slots.entries('shell.actions')).toHaveLength(0)
  await fiber.dispose();expect(listeners.size).toBe(0)
  expect(stopPoll).toHaveBeenCalledWith(-2)
  const disposedReads=vi.mocked(host.business!.invoke).mock.calls.length
  window.dispatchEvent(new Event('focus'));polls[1]!()
  expect(vi.mocked(host.business!.invoke).mock.calls).toHaveLength(disposedReads)
  expect(face.hooks.account.getSnapshot().scope).toBeNull()
  expect(face.hooks.modelInsights.getSnapshot().scope).toBeNull()
})
