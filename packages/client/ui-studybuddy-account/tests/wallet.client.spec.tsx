// @vitest-environment jsdom
import {it,expect,afterEach,vi} from 'vitest'
import QRCode from 'qrcode/lib/browser.js'
import type {RechargeOrderView} from '@studybuddy/contracts'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {WalletButton} from '../src/client/WalletButton.tsx'
import {RechargeDialog} from '../src/client/RechargeDialog.tsx'
import type {AccountSnapshot} from '../src/client/account-controller.ts'
import type {RechargeSnapshot} from '../src/client/recharge-controller.ts'
import {zh} from '../src/client/locales.ts'
vi.mock('qrcode/lib/browser.js',()=>({default:{toCanvas:vi.fn(async()=>{})}}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('shows one global balance button and directly opens the existing recharge flow',()=>{
  let recharges=0
  const state={scope:{accountId:'a',generation:1},status:'ready' as const,summary:{balance:'13.1234567',frozenBalance:'1',availableBalance:'12.1234567',platformAccess:null},stale:false,errorCode:null}
  render(<WalletButton useAccount={select=>select(state)} openRecharge={()=>{recharges++}} t={key=>zh[key]} />)
  const button=screen.getByRole('button',{name:/12.1234567/});button.focus();fireEvent.click(button)
  expect(recharges).toBe(1);expect(screen.queryByRole('menu')).toBeNull();expect(screen.getAllByRole('button')).toHaveLength(1)
})
const account:AccountSnapshot={scope:{accountId:'a',generation:1},status:'ready',summary:{balance:'13.1234567',frozenBalance:'1',availableBalance:'12.1234567',platformAccess:null},stale:false,errorCode:null}
const recharge:RechargeSnapshot={scope:account.scope,tiers:[],coupons:null,referral:null,referralRecords:null,order:null,pendingCreation:null,busy:false,closed:false,errorCode:null}
const actions={load:async()=>{},create:async()=>{},retryCreation:async()=>{},query:async()=>{},cancel:async()=>{},coupons:async()=>{},referrals:async()=>{}}
it('retains exact total, available and frozen balances inside the original recharge dialog',()=>{
  render(<RechargeDialog account={account} state={recharge} actions={actions} open onClose={()=>{}} t={key=>zh[key]}/>)
  expect(screen.getByText('总余额')).toBeTruthy();expect(screen.getByText('¥13.1234567')).toBeTruthy()
  expect(screen.getByText('可用余额')).toBeTruthy();expect(screen.getByText('¥12.1234567')).toBeTruthy()
  expect(screen.getByText('冻结余额')).toBeTruthy();expect(screen.getByText('¥1')).toBeTruthy()
  expect(screen.getByRole('tab',{name:'充值金额'})).toBeTruthy()
})
it('marks cached wallet values stale, and never shows an unavailable wallet as zero',()=>{
  const view=render(<RechargeDialog account={{...account,stale:true,status:'error',errorCode:'NETWORK_UNAVAILABLE'}} state={recharge} actions={actions} open onClose={()=>{}} t={key=>zh[key]}/>)
  expect(screen.getByText('暂未同步')).toBeTruthy();expect(screen.getByText('¥12.1234567')).toBeTruthy()
  view.rerender(<RechargeDialog account={{...account,summary:null,status:'loading'}} state={recharge} actions={actions} open onClose={()=>{}} t={key=>zh[key]}/>)
  expect(screen.getAllByText('—')).toHaveLength(3);expect(screen.queryByText('¥0')).toBeNull()
})

const pendingOrder:RechargeOrderView={orderId:'sbrc_'+'q'.repeat(43),tierCode:'recharge-20',currency:'CNY',grossFen:2000,discountFen:0,payableFen:2000,creditedFen:2000,couponCount:0,state:'PENDING',testMode:false,paymentMode:'wechat_native',qrPayload:'weixin://wxpay/bizpayurl?pr=component-fixture-only',expiresAt:'2026-10-12T08:00:00.000Z',createdAt:'2026-10-12T07:00:00.000Z',updatedAt:'2026-10-12T07:00:00.000Z',nextPollAfterMs:5000}
it.each(['RECONCILIATION_REQUIRED','EXPIRED','COMPLETED'] as const)('keeps %s payments internal while retaining recharge availability and success feedback',state=>{
  const callbacks={...actions,create:vi.fn(actions.create),cancel:vi.fn(actions.cancel)}
  render(<RechargeDialog account={account} state={{...recharge,order:{...pendingOrder,state,qrPayload:null},tiers:[{tierCode:'recharge-20',grossFen:2000,currency:'CNY',testMode:false,paymentMode:'wechat_native'}]}} actions={callbacks} open onClose={()=>{}} t={key=>zh[key]}/>)
  expect(screen.queryByText(pendingOrder.orderId)).toBeNull()
  for(const label of ['充值订单','应付金额','优惠金额','入账金额','有效期'])expect(screen.queryByText(label)).toBeNull()
  expect(screen.queryByRole('button',{name:'取消订单'})).toBeNull()
  expect(screen.queryByRole('button',{name:'查询原订单'})).toBeNull()
  const tier=screen.getByRole('button',{name:'¥20.00'}) as HTMLButtonElement
  if(state==='RECONCILIATION_REQUIRED'){
    expect(tier.disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('正在确认支付结果，请稍候')
    expect(screen.queryByRole('button',{name:'生成付款码'})).toBeNull()
  }else{
    expect(tier.disabled).toBe(false)
    fireEvent.click(tier)
    expect((screen.getByRole('button',{name:'生成付款码'}) as HTMLButtonElement).disabled).toBe(false)
    if(state==='COMPLETED')expect(screen.getByText('充值成功')).toBeTruthy()
  }
  expect(callbacks.create).not.toHaveBeenCalled()
  expect(callbacks.cancel).not.toHaveBeenCalled()
})
it('reopens the original WeChat code without creating or cancelling a payment',()=>{
  const mutations={...actions,create:vi.fn(actions.create),cancel:vi.fn(actions.cancel),query:vi.fn(actions.query)},onClose=vi.fn()
  const state={...recharge,order:pendingOrder}
  const props={account,state,actions:mutations,onClose,t:(key:keyof typeof zh)=>zh[key]}
  const view=render(<RechargeDialog {...props} open/>)
  expect(screen.getByRole('dialog',{name:'微信充值'})).toBeTruthy()
  expect(screen.getByRole('img',{name:'请使用微信扫描付款码'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'关闭'}));expect(onClose).toHaveBeenCalledOnce()
  view.rerender(<RechargeDialog {...props} open={false}/>);view.rerender(<RechargeDialog {...props} open/>)
  expect(QRCode.toCanvas).toHaveBeenCalledTimes(2)
  for(const call of vi.mocked(QRCode.toCanvas).mock.calls)expect(call[1]).toBe(pendingOrder.qrPayload)
  expect(mutations.create).not.toHaveBeenCalled();expect(mutations.cancel).not.toHaveBeenCalled();expect(mutations.query).not.toHaveBeenCalled()
})
it('keeps mock recharge explicitly marked as a test payment',()=>{
  render(<RechargeDialog account={account} state={{...recharge,order:{...pendingOrder,testMode:true,paymentMode:'mock'}}} actions={actions} open onClose={()=>{}} t={key=>zh[key]}/>)
  expect(screen.queryByRole('dialog',{name:'微信充值'})).toBeNull()
  expect(screen.getByText('测试支付')).toBeTruthy()
})
it('returns from an unpaid code to amount selection only after the original cancellation is confirmed',async()=>{
  const cancel=vi.fn(async()=>{}),callbacks={...actions,cancel}
  const state={...recharge,order:pendingOrder,tiers:[{tierCode:'recharge-20' as const,grossFen:2000 as const,currency:'CNY' as const,testMode:false,paymentMode:'wechat_native' as const}]}
  const view=render(<RechargeDialog account={account} state={state} actions={callbacks} open onClose={()=>{}} t={key=>zh[key]}/>)
  fireEvent.click(screen.getByRole('button',{name:'重新选择金额'}))
  expect(cancel).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button',{name:'¥20.00'})).toBeNull()
  view.rerender(<RechargeDialog account={account} state={{...state,order:{...pendingOrder,state:'CANCELLED',qrPayload:null}}} actions={callbacks} open onClose={()=>{}} t={key=>zh[key]}/>)
  expect((screen.getByRole('button',{name:'¥20.00'}) as HTMLButtonElement).disabled).toBe(false)
})
it.each(['PAID','RECONCILIATION_REQUIRED'] as const)('does not offer a replacement payment while the original is %s',state=>{
  render(<RechargeDialog account={account} state={{...recharge,order:{...pendingOrder,state}}} actions={actions} open onClose={()=>{}} t={key=>zh[key]}/>)
  expect(screen.queryByRole('button',{name:'重新选择金额'})).toBeNull()
})
it('retries a failed read of the same scan order without creating a replacement',()=>{
  const callbacks={...actions,query:vi.fn(actions.query),create:vi.fn(actions.create),load:vi.fn(actions.load)}
  render(<RechargeDialog account={account} state={{...recharge,order:pendingOrder,errorCode:'NETWORK_UNAVAILABLE'}} actions={callbacks} open onClose={()=>{}} t={key=>zh[key]}/>)
  expect(screen.getByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'重试'}))
  expect(callbacks.query).toHaveBeenCalledOnce();expect(callbacks.create).not.toHaveBeenCalled();expect(callbacks.load).not.toHaveBeenCalled()
})
