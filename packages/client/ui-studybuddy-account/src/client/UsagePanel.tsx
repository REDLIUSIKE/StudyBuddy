/** Original platform fees and supplier usage have separate tables and exact attribution. */
import {Button,Modal,SegmentedTabs} from '@deepseek-ai/dsh-client-ui-primitives'
import type {UsageSnapshot} from './usage-controller.ts'
import type {AccountFace} from './face.ts'
import type {AccountLocaleKey} from './locales.ts'
import {moneyText} from './account-controller.ts'
import {ErrorNotice} from './ErrorNotice.tsx'
import css from './MyAiPanel.module.css'
export function UsagePanel({state,actions,kind,setKind,t}:{state:UsageSnapshot;actions:AccountFace['usage'];kind:'platform'|'user_api';setKind(kind:'platform'|'user_api'):void;t(key:AccountLocaleKey):string}){
  const refresh=():void=>{void(kind==='platform'?actions.loadPlatform(state.platform?.page??1,20):actions.loadOwn())}
  const tokens=(value:number|null):string=>value===null?t('unknown'):String(value)
  const status=(value:string):string=>t(('status_'+value) as AccountLocaleKey)
  return <section className={css.section}>
    <div className={css.heading}><SegmentedTabs items={[{value:'platform',label:t('platformUsage'),id:'sb-platform-usage',panelId:'sb-usage-body'},{value:'user_api',label:t('userUsage'),id:'sb-native-usage',panelId:'sb-usage-body'}]} value={kind} label={t('usage')} onChange={value=>{setKind(value);void(value==='platform'?actions.loadPlatform():actions.loadOwn())}}/><Button size="sm" disabled={state.busy} onClick={refresh}>{t('refresh')}</Button></div>
    <ErrorNotice code={state.errorCode} t={t} retry={refresh}/>{state.busy&&<p role="status">{t('loading')}</p>}{state.stale&&<p className={css.secondary}>{t('stale')}</p>}
    {kind==='platform'?<>
      <div className={css.tableWrap}><table className={css.table}><thead><tr>{(['created','model','input','output','cache','cost','status'] as const).map(key=><th key={key}>{t(key)}</th>)}<th>{t('details')}</th></tr></thead>
        <tbody>{state.platform?.items.map(row=><tr key={row.id}><td><time>{row.createdAt}</time></td><td>{row.model}</td><td>{tokens(row.inputTokens)}</td><td>{tokens(row.outputTokens)}</td><td>{tokens(row.cachedTokens)}</td><td>{row.actualCost===null?t('unknown'):moneyText(row.actualCost)}</td><td>{status(row.status)}</td><td><Button size="sm" onClick={()=>{void actions.loadPlatformDetail(row.id)}}>{t('details')}</Button></td></tr>)}</tbody></table></div>
      {state.platform?.items.length===0&&<p className={css.empty}>{t('none')}</p>}
      <div className={css.actions}><Button size="sm" disabled={state.busy||!state.platform||state.platform.page<=1} onClick={()=>{void actions.loadPlatform(state.platform!.page-1,20)}}>{t('previous')}</Button><span>{state.platform?.page??1}</span><Button size="sm" disabled={state.busy||!state.platform||state.platform.page*state.platform.pageSize>=state.platform.total} onClick={()=>{void actions.loadPlatform(state.platform!.page+1,20)}}>{t('next')}</Button></div>
    </>:<>
      <p className={css.secondary}>{t('externalBilling')}</p>
      {state.own.length===0&&!state.busy&&!state.errorCode&&<p className={css.empty}>{t('noGateway')}</p>}
      {state.own.map(page=><div className={css.section} key={page.toolId}><h3>{page.toolId}</h3>
        <div className={css.tableWrap}><table className={css.table}><thead><tr>{(['created','model','input','output','cacheRead','cacheWrite','reasoning','status'] as const).map(key=><th key={key}>{t(key)}</th>)}</tr></thead>
          <tbody>{page.records.map(row=><tr key={row.requestId}><td><time>{new Date(row.createdAt*1000).toISOString()}</time></td><td>{row.modelId}</td><td>{tokens(row.inputTotalTokens??row.inputTokens)}</td><td>{tokens(row.outputTokens)}</td><td>{tokens(row.cacheReadTokens)}</td><td>{tokens(row.cacheWriteTokens)}</td><td>{tokens(row.reasoningTokens)}</td><td>{status(row.outcome)}</td></tr>)}</tbody></table></div>
        {page.records.length===0&&<p className={css.empty}>{t('none')}</p>}
        {page.nextCursor&&<Button size="sm" disabled={state.busy} onClick={()=>{void actions.nextOwn(page.toolId)}}>{t('loadMore')}</Button>}
      </div>)}
    </>}
    <Modal open={state.detail!==null} title={t('details')} closeLabel={t('close')} onClose={actions.closeDetail}>
      {state.detail&&<dl className={css.detail}>{([
        ['request',state.detail.requestIdSuffix],['model',state.detail.model],['status',status(state.detail.status)],
        ['reserved',moneyText(state.detail.reservedAmount)],['cost',state.detail.actualCost===null?t('unknown'):moneyText(state.detail.actualCost)],['released',state.detail.releasedAmount===null?t('unknown'):moneyText(state.detail.releasedAmount)],
        ['input',tokens(state.detail.inputTokens)],['output',tokens(state.detail.outputTokens)],['cache',tokens(state.detail.cachedTokens)],['created',state.detail.createdAt],['settledAt',state.detail.settledAt??t('unknown')],['stableCode',state.detail.stableCode??t('none')],
      ] satisfies [AccountLocaleKey,string][]).map(([key,value])=><div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}</dl>}
    </Modal>
  </section>
}
