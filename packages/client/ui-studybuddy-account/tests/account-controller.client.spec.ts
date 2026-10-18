import {expect,it,vi} from 'vitest'
import {StudyBuddyAccountController,moneyText} from '../src/client/account-controller.ts'
it('preserves exact money and does not display a failed initial balance as zero',async()=>{
  let fail=true
  const controller=new StudyBuddyAccountController({getAiAccountSummary:async()=>{if(fail)throw new Error('NETWORK_UNAVAILABLE');return {balance:'13.1234567',frozenBalance:'1',availableBalance:'12.1234567',platformAccess:null}}})
  controller.setScope({accountId:'a',generation:1})
  await controller.refreshSummary()
  expect(controller.getSnapshot().summary).toBeNull()
  fail=false;await controller.refreshSummary()
  expect(moneyText(controller.getSnapshot().summary?.availableBalance)).toBe('¥12.1234567')
  fail=true;await controller.refreshSummary()
  expect(controller.getSnapshot().stale).toBe(true)
  expect(controller.getSnapshot().summary?.availableBalance).toBe('12.1234567')
})
it('rejects old account data without replacing the new snapshot',async()=>{
  let resolve:(value:{balance:string;availableBalance:string;frozenBalance:string;platformAccess:null})=>void=()=>{}
  const controller=new StudyBuddyAccountController({getAiAccountSummary:()=>new Promise(done=>{resolve=done})})
  controller.setScope({accountId:'a',generation:1})
  const old=controller.refreshSummary()
  controller.setScope({accountId:'b',generation:2})
  resolve({balance:'99',frozenBalance:'0',availableBalance:'99',platformAccess:null});await old
  expect(controller.getSnapshot().scope?.accountId).toBe('b');expect(controller.getSnapshot().summary).toBeNull()
})
it('shares an in-flight authoritative balance read across automatic and explicit refreshes',async()=>{
  let finish!:(value:{balance:string;availableBalance:string;frozenBalance:string;platformAccess:null})=>void
  const read=vi.fn(()=>new Promise<{balance:string;availableBalance:string;frozenBalance:string;platformAccess:null}>(resolve=>{finish=resolve}))
  const controller=new StudyBuddyAccountController({getAiAccountSummary:read})
  controller.setScope({accountId:'a',generation:1})
  const first=controller.refreshSummary(),second=controller.refreshSummary()
  expect(read).toHaveBeenCalledOnce()
  finish({balance:'8.0000001',availableBalance:'7.0000001',frozenBalance:'1',platformAccess:null})
  await Promise.all([first,second])
  expect(controller.getSnapshot().summary?.availableBalance).toBe('7.0000001')
  controller.dispose()
})
it('starts the new account read without joining the previous account request',async()=>{
  type Summary={balance:string;availableBalance:string;frozenBalance:string;platformAccess:null}
  const pending:Array<(value:Summary)=>void>=[]
  const controller=new StudyBuddyAccountController({getAiAccountSummary:()=>new Promise<Summary>(resolve=>pending.push(resolve))})
  controller.setScope({accountId:'a',generation:1});const old=controller.refreshSummary()
  controller.setScope({accountId:'b',generation:2});const current=controller.refreshSummary()
  pending[0]!({balance:'99',availableBalance:'99',frozenBalance:'0',platformAccess:null});await old
  expect(controller.getSnapshot().summary).toBeNull()
  pending[1]!({balance:'8',availableBalance:'7',frozenBalance:'1',platformAccess:null});await current
  expect(controller.getSnapshot().summary?.availableBalance).toBe('7')
  controller.dispose()
})
