// @vitest-environment jsdom
import {it,expect,afterEach} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import {UsagePanel} from '../src/client/UsagePanel.tsx'
import {zh} from '../src/client/locales.ts'
afterEach(cleanup)
it('retains canonical cost precision and does not turn unknown Token usage into zero',()=>{
  const state={scope:{accountId:'fixture',generation:1},platform:{items:[{id:'1',requestIdSuffix:'fixture',tool:'codex' as const,model:'kimi-k3' as const,status:'reconciliation_pending' as const,reservedAmount:'1.1234567',actualCost:null,releasedAmount:null,inputTokens:null,outputTokens:null,cachedTokens:null,stableCode:'USAGE_MISSING' as const,createdAt:'2026-10-11T00:00:00.000Z',settledAt:null}],page:1,pageSize:20,total:1},detail:null,own:[],busy:false,errorCode:null,stale:false}
  const actions={loadPlatform:async()=>{},loadPlatformDetail:async()=>{},loadOwn:async()=>{},nextOwn:async()=>{},closeDetail:()=>{}}
  render(<UsagePanel state={state} actions={actions} kind="platform" setKind={()=>{}} t={key=>zh[key]}/>)
  expect(screen.getAllByText('待确认')).toHaveLength(4)
  expect(screen.getByText('结算待核对')).toBeTruthy()
  expect(screen.queryByText('¥0')).toBeNull()
})
