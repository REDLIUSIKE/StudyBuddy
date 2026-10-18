/** Cached source facts and explicit, protected diagnostic actions. */
import { useId, useState } from 'react'
import { Button, DisclosureRow, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SourceSnapshot } from './source-controller.ts'
import { isSourceV3 } from './source-controller.ts'
import type { AccountFace } from './face.ts'
import type { AccountLocaleKey } from './locales.ts'
import css from './MyAiPanel.module.css'

/** Render only owned cached facts; model calls and balance refreshes require a click. */
export function SourceDiagnostics({ source, state, actions, t }: {
  source: SourceSnapshot['sources'][number]
  state: SourceSnapshot
  actions: AccountFace['source']
  t: (key: AccountLocaleKey) => string
}) {
  const [expanded, setExpanded] = useState(false), [selected, setSelected] = useState(''), [prompt, setPrompt] = useState(''), id = useId()
  const detail = state.details?.[source.localRef]
  const readiness = detail?.readiness ?? state.readiness?.find(row => row.localRef === source.localRef &&
    row.sourceRevision === source.sourceRevision)
  const balance = detail?.balance?.balance
  const references = readiness?.state === 'ready' ? readiness.appliedModels : readiness?.hostApplied?.applied ?? []
  const selection = references.find(ref => ref.routeId + '|' + ref.exactModelId + '|' + ref.protocol === selected)
  const operationId = readiness?.operationId ?? source.operationId
  const availableOperation = operationId !== null && operationId !== undefined && operationId === source.operationId
  const time = (seconds: number | null | undefined): string => seconds === null ||
    seconds === undefined ? t('unknown') : new Date(seconds * 1000).toLocaleString()
  const milliseconds = (value: number | null): string => value === null ? t('unknown') : value + ' ' + t('milliseconds')
  return <div className={css.form}>
    {readiness?.state !== 'ready' && availableOperation && <>
      <div className={css.actions}>
        <Button size="sm" disabled={state.busy} onClick={() => {
          if (operationId) void actions.resumeBuiltin(operationId)
        }}>{t('continuePreparation')}</Button>
        <Button size="sm" variant="outline" disabled={state.busy || readiness?.state === 'unsupported' ||
          !isSourceV3(source) || !source.probeSelection}
        onClick={() => { if (operationId) void actions.validateBuiltin(operationId) }}>{t('validateModel')}</Button>
      </div>
      <p className={css.secondary}>{t('builtinValidationCostNotice')}</p>
    </>}
    <DisclosureRow icon={null} title={t('sourceDiagnostics')} open={expanded} expandable expandOnRowClick onToggle={
      () => { setExpanded(!expanded) }}>
      <div className={css.form}>
        <Button size="sm" variant="outline" disabled={state.busy} onClick={() => {
          void actions.refreshBalance(source.localRef)
        }}>{t('refreshSourceBalance')}</Button>
        <p className={css.secondary}>{t('sourceBalanceNotice')}</p>
        {balance ? <>
          <p>{t(balance.state === 'success' ? 'available' : balance.state === 'stale' ? 'stale' :
            balance.state === 'unsupported' ? 'unavailable' : 'error')}</p>
          {balance.currencies.map(row => <div key={row.currency}>
            <p>{row.currency} · {t('available')}: {row.available}</p>
            <p>{t('balanceCash')}: {row.cash ?? t('unknown')} · {t('balanceGrant')}: {row.grant ?? t('unknown')}</p>
          </div>)}
          <p>{t('checkedAt')}: {time(balance.checkedAt)} · {t('lastSuccess')}: {time(balance.lastSuccessAt)}</p>
          <a href={balance.officialUrl} target="_blank" rel="noreferrer">{t('officialBilling')}</a>
        </> : <p>{t('unknown')}</p>}
        <label htmlFor={id + 'model'}>{t('diagnosticModel')}</label>
        <select id={id + 'model'} className={css.select} value={selected} disabled={state.busy} onChange={(event) => {
          setSelected(event.target.value)
        }}>
          <option value="">{t('chooseExactModel')}</option>{references.map(ref => <option key={
            ref.routeId + '|' + ref.exactModelId + '|' + ref.protocol}
          value={ref.routeId + '|' + ref.exactModelId + '|' + ref.protocol}>{ref.exactModelId} · {ref.protocol}</option>)}
        </select>
        <label htmlFor={id + 'prompt'}>{t('prompt')}</label><Input id={id + 'prompt'} maxLength={512} value={
          prompt} disabled={state.busy} onChange={(event) => { setPrompt(event.target.value) }} />
        <p className={css.secondary}>{t('builtinDiagnosticCostNotice')}</p>
        <Button size="sm" variant="outline" disabled={state.busy || !selection || !availableOperation || !prompt.trim()}
          onClick={() => {
            if (operationId && selection) void actions.diagnostic(operationId, selection,
              prompt.trim())
          }}>{t('runDiagnostic')}</Button>
        {(detail?.lastDiagnostics ?? []).map(result => <div className={css.card} key={result.clientRequestId}>
          <p>{result.selection.exactModelId} · {result.selection.protocol} · {t(('status_' + result.outcome) as AccountLocaleKey)}</p>
          <p>{t('actualReturnedModel')}: {result.returnedModel ?? t('unknown')}</p>
          <p>{t('responseId')}: {result.providerResponseId ?? t('unknown')}</p>
          <p>{t('firstVisibleText')}: <span>{milliseconds(result.firstVisibleTextMs)}</span> · {
            t('terminalLatency')}: <span>{milliseconds(result.dispatchToTerminalMs)}</span></p>
          <p>{t('requestThroughput')}: {result.usageOrigin === 'provider_terminal' && result.usage !== null &&
            result.dispatchToTerminalMs !== null && result.dispatchToTerminalMs > 0
            ? (result.usage.outputTokens * 1000 / result.dispatchToTerminalMs).toFixed(2) + ' ' + t('tokensPerSecond') : t('unknown')}</p>
          {result.usageOrigin === 'provider_terminal' && result.usage ? <>
            <p>{t('trustedUsage')}</p>
            <p>{t('input')}: {result.usage.inputTokens} · {t('output')}: {result.usage.outputTokens}</p>
            <p>{t('cacheRead')}: {result.usage.cacheReadTokens ?? t('unknown')} · {t('cacheWrite')}: {
              result.usage.cacheWriteTokens ?? t('unknown')} · {t('reasoning')}: {result.usage.reasoningTokens ?? t('unknown')}</p>
          </> : <p>{t('unknownUsage')}</p>}
          {result.errorCode && <code>{result.errorCode}</code>}
        </div>)}
      </div>
    </DisclosureRow>
  </div>
}
