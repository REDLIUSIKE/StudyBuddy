/** Coupon selection, resumable payments and payment-code presentation. */
import { useEffect,useRef,useState } from 'react'
import QRCode from 'qrcode/lib/browser.js'
import { Button,Checkbox,Modal,SegmentedTabs,Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RechargeTier } from '@studybuddy/contracts'
import type { RechargeSnapshot } from './recharge-controller.ts'
import { moneyText,type AccountSnapshot } from './account-controller.ts'
import { fenText } from './recharge-controller.ts'
import type { AccountFace } from './face.ts'
import type { AccountLocaleKey } from './locales.ts'
import { ErrorNotice } from './ErrorNotice.tsx'
import css from './MyAiPanel.module.css'
function PaymentCode({ payload,t }:{ payload:string;t:(key:AccountLocaleKey)=>string }){
  const canvas=useRef<HTMLCanvasElement>(null),[failed,setFailed]=useState(false)
  useEffect(()=>{let active=true;setFailed(false);if(canvas.current)void QRCode.toCanvas(canvas.current,payload,{ width:220,margin:2,errorCorrectionLevel:'M' }).catch(()=>{if(active)setFailed(true)});return()=>{active=false}},[payload])
  return failed?<p role="alert">{t('qrFailed')}</p>:<canvas ref={canvas} className={css.qr} role="img" aria-label={t('qrDescription')}/>
}
export function RechargeDialog({ state,account,actions,open,onClose,t }:{ state:RechargeSnapshot;account:AccountSnapshot;actions:AccountFace['recharge'];open:boolean;onClose:()=>void;t:(key:AccountLocaleKey)=>string }){
  const [tab,setTab]=useState<'tiers'|'coupons'|'referral'>('tiers'),[tier,setTier]=useState<RechargeTier['tierCode']|null>(null),[coupons,setCoupons]=useState<readonly string[]>([])
  useEffect(()=>{setTier(null);setCoupons([]);setTab('tiers')},[state.scope])
  const order=state.order,unfinished=order!==null&&!['COMPLETED','CANCELLED','FAILED','EXPIRED','REFUNDED'].includes(order.state)
  const paymentPayload=order&&!order.testMode&&order.paymentMode==='wechat_native'&&unfinished?order.qrPayload:null
  return <Modal open={open} onClose={onClose} title={t(paymentPayload?'wechatRecharge':'recharge')} closeLabel={t('close')} className={(paymentPayload?css.paymentDialog:css.walletDialog)!} contentClassName={(paymentPayload?css.paymentDialogContent:css.walletDialogContent)!} footer={paymentPayload?undefined:<Button variant="outline" onClick={onClose}>{t('close')}</Button>}>
    {paymentPayload?<div className={css.paymentCode}>
      <PaymentCode payload={paymentPayload} t={t}/>
      {order?.state==='PENDING'&&<Button variant="outline" disabled={state.busy} onClick={()=>{void actions.cancel()}}>{t('reselectAmount')}</Button>}
      {order&&order.state!=='PENDING'&&<p className={css.secondary} role="status">{t(order.state==='PAID'?'order_PAID':'paymentConfirming')}</p>}
      <ErrorNotice code={state.errorCode} t={t} retry={()=>{void actions.query()}}/>
    </div>:<div className={css.wallet}>
      <dl className={css.walletSummary}>{([['total',account.summary?.balance],['available',account.summary?.availableBalance],['frozen',account.summary?.frozenBalance]] as const).map(([key,value])=><div key={key} data-wallet-value={key}><dt>{t(key)}</dt><dd>{moneyText(value)}</dd></div>)}</dl>
      {(account.stale||account.status==='error')&&<p className={css.secondary} role="status">{t('stale')}</p>}
      {account.status==='loading'&&<p className={css.secondary} role="status">{t('loading')}</p>}
      <SegmentedTabs items={[{ value:'tiers',label:t('tiers'),id:'sb-recharge-tiers',panelId:'sb-recharge-body' },{ value:'coupons',label:t('coupons'),id:'sb-recharge-coupons',panelId:'sb-recharge-body' },{ value:'referral',label:t('referral'),id:'sb-recharge-referral',panelId:'sb-recharge-body' }]} value={tab} onChange={setTab} label={t('recharge')}/>
      <ErrorNotice code={state.errorCode} t={t} retry={()=>{void actions.load()}}/>
      {state.closed&&<p role="status">{t('paymentClosed')}</p>}{state.busy&&<p role="status">{t('loading')}</p>}
      <div id="sb-recharge-body" role="tabpanel" aria-labelledby={'sb-recharge-'+tab}>
        {tab==='tiers'&&<>
          <div className={css.actions}>{state.tiers.map(row=><Button key={row.tierCode} variant={tier===row.tierCode?'primary':'outline'} disabled={state.busy||unfinished||state.closed||state.pendingCreation!==null} aria-pressed={tier===row.tierCode} onClick={()=>{ setTier(row.tierCode) }}>{fenText(row.grossFen)}</Button>)}</div>
          {state.tiers.length===0&&!state.busy&&!state.errorCode&&<p>{t('paymentClosed')}</p>}
          {state.pendingCreation&&<><p role="status">{t('creationPending')}</p><Button variant="primary" disabled={state.busy||state.closed} onClick={()=>{void actions.retryCreation()}}>{t('resume')}</Button></>}
          {!unfinished&&!state.pendingCreation&&<Button variant="primary" disabled={state.busy||!tier||state.closed} onClick={()=>{if(tier)void actions.create(tier,[...coupons])}}>{t('pay')}</Button>}
          {order?.testMode&&unfinished&&<Tag>{t('mockPayment')}</Tag>}
          {unfinished&&<p role="status">{t(order?.state==='PAID'?'order_PAID':'paymentConfirming')}</p>}
          {order?.state==='COMPLETED'&&<p role="status">{t('completed')}</p>}
          {order?.qrPayload&&unfinished&&<><PaymentCode payload={order.qrPayload} t={t}/><p className={css.secondary}>{t('qrDescription')}</p></>}
        </>}
        {tab==='coupons'&&<>
          {state.coupons?.items.map(coupon=><div className={css.heading} key={coupon.couponId}><Checkbox label={fenText(coupon.valueFen)} checked={coupons.includes(coupon.couponId)} disabled={coupon.status!=='AVAILABLE'||state.busy||unfinished||state.pendingCreation!==null} onChange={(checked)=>{ setCoupons(checked?[...coupons,coupon.couponId]:coupons.filter(id=>id!==coupon.couponId)) }}/><Tag>{t(('coupon_'+coupon.status) as AccountLocaleKey)}</Tag></div>)}
          {state.coupons?.items.length===0&&<p>{t('none')}</p>}
          <div className={css.actions}><Button size="sm" disabled={!state.coupons||state.coupons.page<=1||state.busy} onClick={()=>{if(state.coupons)void actions.coupons(state.coupons.page-1)}}>{t('previous')}</Button><Button size="sm" disabled={!state.coupons||state.coupons.page*state.coupons.pageSize>=state.coupons.total||state.busy} onClick={()=>{if(state.coupons)void actions.coupons(state.coupons.page+1)}}>{t('next')}</Button></div>
        </>}
        {tab==='referral'&&<>
          <p>{t('invited')} · {state.referral?.invitedCount??'—'}</p><p className={css.secondary}>{t('rewardUnavailable')}</p>
          {state.referralRecords?.items.map(row=><div className={css.card} key={row.recordId}><span>{row.inviteeMask}</span><time>{row.paidAt}</time><span>{t(row.digitalOrderState==='FULFILLED'?'fulfilled':'refunded')}</span></div>)}
          {state.referralRecords?.items.length===0&&<p>{t('none')}</p>}
          <div className={css.actions}><Button size="sm" disabled={!state.referralRecords||state.referralRecords.page<=1||state.busy} onClick={()=>{if(state.referralRecords)void actions.referrals(state.referralRecords.page-1)}}>{t('previous')}</Button><Button size="sm" disabled={!state.referralRecords||state.referralRecords.page*state.referralRecords.pageSize>=state.referralRecords.total||state.busy} onClick={()=>{if(state.referralRecords)void actions.referrals(state.referralRecords.page+1)}}>{t('next')}</Button></div>
        </>}
      </div>
    </div>}
  </Modal>
}
