import {it,expect,vi} from 'vitest'
import {RechargeController} from '../src/client/recharge-controller.ts'
import type {RechargeOrderView} from '@studybuddy/contracts'
it('keeps polling the same retained order when a timer fires during a failed cancellation',async()=>{
  let rejectCancel!:(reason:Error)=>void
  const cancellation=new Promise<RechargeOrderView>((_resolve,reject)=>{rejectCancel=reject})
  const timers:Array<()=>void>=[],refresh=vi.fn(async()=>{}),query=vi.fn(async()=>({...order,state:'COMPLETED' as const,nextPollAfterMs:null}))
  const controller=new RechargeController({listRechargeTiers:async()=>[],listRechargeCoupons:async()=>({items:[],total:0,page:1,pageSize:20}),getReferralSummary:async()=>({invitedCount:0,rewardAvailability:{status:'UNAVAILABLE',reason:'NO_AUTHORITATIVE_COUPON_LEDGER'}}),listReferralRecords:async()=>({items:[],total:0,page:1,pageSize:20}),getActiveRechargeOrder:async()=>null,getRechargeOrder:query,cancelRechargeOrder:()=>cancellation,createRechargeOrder:async()=>order},refresh,(callback)=>{timers.push(callback);return()=>{}})
  controller.setScope({accountId:'a',generation:1});controller.accept(order)
  const cancel=controller.cancel();timers.shift()!();rejectCancel(new Error('NETWORK_UNAVAILABLE'));await cancel
  expect(timers).toHaveLength(1)
  timers.shift()!();await vi.waitFor(()=>expect(query).toHaveBeenCalledWith(order.orderId))
  await vi.waitFor(()=>expect(refresh).toHaveBeenCalledOnce());expect(controller.getSnapshot().order?.state).toBe('COMPLETED');controller.dispose()
})
const order:RechargeOrderView={orderId:'sbrc_'+'a'.repeat(43),tierCode:'recharge-20',currency:'CNY',grossFen:2000,discountFen:0,payableFen:2000,creditedFen:2000,couponCount:0,state:'RECONCILIATION_REQUIRED',testMode:false,paymentMode:'wechat_native',qrPayload:null,expiresAt:null,createdAt:'2026-10-11T00:00:00.000Z',updatedAt:'2026-10-11T00:00:00.000Z',nextPollAfterMs:5000}
it('keeps the original amount, coupons and idempotency after an unknown creation result',async()=>{
  const create=vi.fn().mockRejectedValueOnce(new Error('RECHARGE_RESULT_UNKNOWN')).mockResolvedValue({...order,state:'PENDING'})
  const controller=new RechargeController({listRechargeTiers:async()=>[{tierCode:'recharge-20',grossFen:2000,currency:'CNY',testMode:false,paymentMode:'wechat_native'},{tierCode:'recharge-50',grossFen:5000,currency:'CNY',testMode:false,paymentMode:'wechat_native'}],listRechargeCoupons:async()=>({items:[],total:0,page:1,pageSize:20}),getReferralSummary:async()=>({invitedCount:0,rewardAvailability:{status:'UNAVAILABLE',reason:'NO_AUTHORITATIVE_COUPON_LEDGER'}}),listReferralRecords:async()=>({items:[],total:0,page:1,pageSize:20}),getActiveRechargeOrder:async()=>null,getRechargeOrder:async()=>order,cancelRechargeOrder:async()=>order,createRechargeOrder:create},async()=>{},()=>()=>{})
  controller.setScope({accountId:'a',generation:1});await controller.load()
  await controller.create('recharge-20',['sbcp_'+'b'.repeat(43)])
  expect(controller.getSnapshot().pendingCreation?.tierCode).toBe('recharge-20')
  await controller.create('recharge-50',[])
  expect(create).toHaveBeenCalledTimes(1)
  expect(controller.getSnapshot().errorCode).toBe('RECHARGE_CREATION_PENDING')
  await controller.retryCreation()
  expect(create).toHaveBeenCalledTimes(2)
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0])
  expect(controller.getSnapshot().pendingCreation).toBeNull()
  controller.dispose()
})
it('keeps reconciliation orders when active is null and refreshes completed balance once',async()=>{
  let queried=0,refreshed=0
  const controller=new RechargeController({
    listRechargeTiers:async()=>[],listRechargeCoupons:async()=>({items:[],total:0,page:1,pageSize:20}),getReferralSummary:async()=>({invitedCount:0,rewardAvailability:{status:'UNAVAILABLE',reason:'NO_AUTHORITATIVE_COUPON_LEDGER'}}),listReferralRecords:async()=>({items:[],total:0,page:1,pageSize:20}),
    getActiveRechargeOrder:async()=>null,getRechargeOrder:async()=>{queried++;return {...order,state:'COMPLETED',nextPollAfterMs:null}},
    cancelRechargeOrder:async()=>order,createRechargeOrder:async()=>order,
  },async()=>{refreshed++},()=>()=>{})
  controller.setScope({accountId:'a',generation:1})
  controller.accept(order);await controller.load();expect(queried).toBe(1);expect(controller.getSnapshot().order?.orderId).toBe(order.orderId)
  await controller.query();expect(refreshed).toBe(1)
  controller.dispose()
})
it.each(['PAID','RECONCILIATION_REQUIRED','PENDING','unknown'] as const)('retains the original payment when amount reselection returns %s',async state=>{
  const create=vi.fn(async()=>({...order,state:'PENDING' as const})),cancel=vi.fn(async()=>{
    if(state==='unknown')throw new Error('NETWORK_UNAVAILABLE')
    return {...order,state}
  })
  const controller=new RechargeController({
    listRechargeTiers:async()=>[{tierCode:'recharge-20',grossFen:2000,currency:'CNY',testMode:false,paymentMode:'wechat_native'}],
    listRechargeCoupons:async()=>({items:[],total:0,page:1,pageSize:20}),getReferralSummary:async()=>({invitedCount:0,rewardAvailability:{status:'UNAVAILABLE',reason:'NO_AUTHORITATIVE_COUPON_LEDGER'}}),listReferralRecords:async()=>({items:[],total:0,page:1,pageSize:20}),
    getActiveRechargeOrder:async()=>null,getRechargeOrder:async()=>({...order,state:'RECONCILIATION_REQUIRED'}),cancelRechargeOrder:cancel,createRechargeOrder:create,
  },async()=>{},()=>()=>{})
  controller.setScope({accountId:'a',generation:1});await controller.load();controller.accept({...order,state:'PENDING'})
  await controller.cancel();await controller.create('recharge-20',[])
  expect(cancel).toHaveBeenCalledExactlyOnceWith(order.orderId)
  expect(create).not.toHaveBeenCalled()
  expect(controller.getSnapshot().order?.orderId).toBe(order.orderId)
  controller.dispose()
})
it('creates a newly selected amount only after cancellation confirms the previous order',async()=>{
  const create=vi.fn(async()=>({...order,orderId:'sbrc_'+'z'.repeat(43),tierCode:'recharge-50' as const,grossFen:5000 as const,payableFen:5000,creditedFen:5000,state:'PENDING' as const}))
  const controller=new RechargeController({
    listRechargeTiers:async()=>[{tierCode:'recharge-50',grossFen:5000,currency:'CNY',testMode:false,paymentMode:'wechat_native'}],
    listRechargeCoupons:async()=>({items:[],total:0,page:1,pageSize:20}),getReferralSummary:async()=>({invitedCount:0,rewardAvailability:{status:'UNAVAILABLE',reason:'NO_AUTHORITATIVE_COUPON_LEDGER'}}),listReferralRecords:async()=>({items:[],total:0,page:1,pageSize:20}),
    getActiveRechargeOrder:async()=>null,getRechargeOrder:async()=>order,cancelRechargeOrder:async()=>({...order,state:'CANCELLED'}),createRechargeOrder:create,
  },async()=>{},()=>()=>{})
  controller.setScope({accountId:'a',generation:1});await controller.load();controller.accept({...order,state:'PENDING'})
  await controller.cancel();await controller.create('recharge-50',[])
  expect(create).toHaveBeenCalledExactlyOnceWith('recharge-50',[],expect.any(String))
  expect(controller.getSnapshot().order?.tierCode).toBe('recharge-50')
  controller.dispose()
})
