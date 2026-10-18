/** One-click verified source saving, independent of later tool connection. */
import { useEffect,useId,useRef,useState } from 'react'
import { Button,Input,Modal,DisclosureRow,Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NativeProtocol } from '@studybuddy/contracts'
import type { SourceDraft, SourceSnapshot } from './source-controller.ts'
import type { AccountFace } from './face.ts'
import type { AccountLocaleKey } from './locales.ts'
import { ErrorNotice } from './ErrorNotice.tsx'
import { SourceManagement } from './SourceManagement.tsx'
import css from './MyAiPanel.module.css'
export function SourceEditor({ state, actions, t, onClose }: {
  state: SourceSnapshot
  actions: AccountFace['source']
  t: (key: AccountLocaleKey) => string
  onClose: () => void
}) {
  const [reveal, setReveal] = useState(false), [advanced, setAdvanced] = useState(false), [probeModel,
      setProbeModel] = useState(''), [prompt, setPrompt] = useState(''), [clipboardFailed,
      setClipboardFailed] = useState(false), id = useId()
  const draft=state.draft,check=state.checkResult
  const source=state.sources.find(row=>row.localRef===draft?.internalId)
  const active=useRef(true),current=useRef(state);current.current=state
  useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
  useEffect(()=>{if(!draft){setReveal(false);setClipboardFailed(false)}},[draft===null])
  const update = (patch: Partial<SourceDraft>): void => { actions.editDraft(patch) }
  const isV3 = draft?.schemaVersion === 3
  const nativeCandidates = state.admittedModels ?? []
  const catalogModels = state.nativeCatalog && Date.parse(state.nativeCatalog.expiresAt) > Date.now() ? state.nativeCatalog.models : []
  const manualModels = [...new Map([...catalogModels, ...nativeCandidates].map(model =>
    [model.providerId + '|' + model.exactModelId + '|' + model.protocol, model])).values()]
  const selectable = manualModels.filter(model => draft?.sourcePresetId ? model.providerId === draft.sourcePresetId :
    nativeCandidates.includes(model) || state.nativeCatalog?.transports.some(transport =>
      transport.providerId === model.providerId && transport.protocol === model.protocol &&
      (transport.baseUrl === draft?.advanced?.baseUrl || transport.baseUrl === draft?.advanced?.anthropicUrl)))
  const selectedValue = isV3 && draft.probeSelection ? draft.probeSelection.exactModelId + '|' + draft.probeSelection.protocol : ''
  const selectedAvailable = !isV3 || selectable.some(model => model.exactModelId === draft.probeSelection?.exactModelId &&
    model.protocol === draft.probeSelection?.protocol)
  const clipboard=async(paste:boolean):Promise<void>=>{
    const captured=current.current
    const owned=()=>active.current&&captured.draft===current.current.draft
      &&captured.scope?.accountId===current.current.scope?.accountId
      &&captured.scope?.generation===current.current.scope?.generation
    setClipboardFailed(false)
    try{
      if(paste){
        const apiKey=await navigator.clipboard.readText()
        if(owned()&&!current.current.busy&&!current.current.pending)update({ apiKey })
      }
      else await navigator.clipboard.writeText(captured.draft?.apiKey??'')
    }catch{if(owned())setClipboardFailed(true)}
  }
  const endpoint=(key:'baseUrl'|'anthropicUrl'|'modelsUrl',value:string):void=>{
    update({ advanced:{ baseUrl:draft?.advanced?.baseUrl??'',anthropicUrl:draft?.advanced?.anthropicUrl??null,modelsUrl:
      draft?.advanced?.modelsUrl??null,protocol:draft?.advanced?.protocol??null,[key]:key==='baseUrl'?value:value||null } })
  }
  const probe=():void=>{
    const probeDraft=current.current.draft,configuration=probeDraft?.advanced
    if(!probeDraft||!configuration?.protocol)return
    void actions.probe({
      schemaVersion:1,internalId:probeDraft.internalId,expectedLocalRevision:probeDraft.expectedLocalRevision,
      name:probeDraft.name,baseUrl:configuration.baseUrl,anthropicUrl:configuration.anthropicUrl,
      apiKey:probeDraft.apiKey,modelId:probeModel.trim(),protocols:[configuration.protocol],
    },prompt||undefined)
  }
  return <Modal open={draft !== null} onClose={onClose} title={t(draft?.internalId ? 'edit' : 'addSource')} closeLabel={t('close')}
    className={css.sourceDialog ?? ''} contentClassName={css.sourceDialogContent ?? ''} footer={
      <><Button variant="outline" disabled={state.busy} onClick={onClose}>{t('cancel')}</Button>
        {state.pending ? <Button variant="primary" disabled={state.busy} onClick={() => { void actions.resume() }}>{t('resume')}</Button> :
          <Button variant="primary" disabled={state.busy || !draft?.name.trim() || !draft.apiKey.trim() ||
            !(draft.sourcePresetId || draft.advanced?.baseUrl) || !selectedAvailable} onClick={() => {
            void actions.detectAndSave()
          }}>{t(isV3 ? (state.busy ? 'savingAndValidating' : 'saveAndValidate') :
              (state.busy ? 'detectingAndSaving' : 'detectAndSave'))}</Button>}</>
    }>
    {draft && <div className={css.form}>
      {source && <SourceManagement key={source.localRef} source={source} state={state} actions={actions}
        t={t} onClose={onClose} showInventory={!check?.inventory} />}
      <label htmlFor={id + 'name'}>{t('name')}</label><Input id={id + 'name'} value={draft.name} disabled={
        !!state.pending} onChange={(event) => { update({ name: event.target.value }) }} />
      <label htmlFor={id + 'key'}>{t('key')}</label><Input id={id + 'key'} type={reveal ? 'text' :
        'password'} autoComplete="off" spellCheck={false} value={draft.apiKey} disabled={state.busy ||
          !!state.pending} onChange={(event) => { update({ apiKey: event.target.value }) }} />
      <div className={css.actions}>
        <Button size="sm" aria-pressed={reveal} onClick={() => { setReveal(!reveal) }}>{t(reveal ? 'hide' : 'reveal')}</Button>
        <Button size="sm" onClick={() => { void clipboard(false) }}>{t('copy')}</Button>
        <Button size="sm" disabled={state.busy || !!state.pending} onClick={() => { void clipboard(true) }}>{t('paste')}</Button>
      </div>
      {clipboardFailed && <p role="alert">{t('clipboardFailed')}</p>}
      <label htmlFor={id + 'preset'}>{t('preset')}</label>
      <select id={id + 'preset'} className={css.select} value={draft.sourcePresetId ?? ''} disabled={state.busy ||
        !!state.pending} onChange={(event) => {
        update({
          sourcePresetId: event.target.value || null, advanced: null, ...(isV3 ? {
            probeSelection: null,
          } : {}),
        })
      }}>
        <option value="">{t('customSource')}</option>{(isV3 ? ['deepseek', 'kimi', 'hunyuan', 'zhipu', 'minimax', 'mimo',
          'openai', 'anthropic'] : ['deepseek', 'kimi', 'openai', 'anthropic']).map(preset => <option key={preset} value={
          preset}>{preset}</option>)}
      </select>
      {isV3 && <>
        <Button size="sm" variant="outline" disabled={state.busy || !!state.pending || !draft.apiKey.trim() ||
          !(draft.sourcePresetId || draft.advanced?.baseUrl)} onClick={() => { void actions.check() }}>{t('discoverModels')}</Button>
        <p className={css.secondary}>{t('discoveryNotice')}</p>
        <label htmlFor={id + 'manual-model'}>{t('validationModel')}</label>
        <select id={id + 'manual-model'} className={css.select} value={selectedValue} disabled={state.busy ||
          !!state.pending} onChange={(event) => {
          const selected = selectable.find(model => model.exactModelId + '|' + model.protocol === event.target.value)
          update({ probeSelection: selected ? { exactModelId: selected.exactModelId, protocol: selected.protocol } : null })
        }}><option value="">{t('chooseExactModel')}</option>{selectable.map(model => <option key={
            model.exactModelId + '|' + model.protocol} value={model.exactModelId + '|' + model.protocol}>{model.displayName} · {
              model.exactModelId} · {model.protocol}</option>)}</select>
        {!selectable.length && <p className={css.secondary} role={state.catalogBusy ? 'status' : undefined}>{t(state.catalogBusy ? 'loading' : 'noAdmittedModels')}</p>}
      </>}
      <p className={css.secondary}>{t(isV3 ? 'builtinValidationCostNotice' : 'probeCostNotice')}</p>
      <DisclosureRow icon={null} title={t('advanced')} open={advanced} expandable expandOnRowClick onToggle={() => {
        setAdvanced(!advanced)
      }}>
        <div className={css.form}>
          {(['baseUrl', 'anthropicUrl', 'modelsUrl'] as const).map(key => <label key={key}>{t(key)}<Input value={
            draft.advanced?.[key] ?? ''} disabled={state.busy || !!state.pending} onChange={(event) => {
            endpoint(key,
              event.target.value)
          }} /></label>)}
          <label>{t('protocol')}<select className={css.select} disabled={state.busy || !!state.pending} value={
            draft.advanced?.protocol ?? ''} onChange={(event) => {
            update({
              advanced: {
                baseUrl: draft.advanced?.baseUrl ?? '',
                anthropicUrl: draft.advanced?.anthropicUrl ?? null, modelsUrl: draft.advanced?.modelsUrl ?? null, protocol:
                    event.target.value === '' ? null : event.target.value as NativeProtocol,
              },
            })
          }}>
            <option value="">{t('automatic')}</option>{['openai_responses', 'openai_chat_completions',
              'anthropic_messages'].map(protocol => <option value={protocol} key={protocol}>{protocol}</option>)}
          </select></label>
          <Button size="sm" variant="outline" disabled={state.busy || !draft.advanced?.baseUrl} onClick={() => {
            if (draft.advanced) void actions.ping(draft.advanced.baseUrl, draft.advanced.anthropicUrl)
          }}>{t('ping')}</Button>
        </div>
      </DisclosureRow>
      {(check?.ping ?? state.ping) && <p className={css.secondary}>{(check?.ping ?? state.ping)?.success ? t('connected') :
        t('connectionFailed')} · {(check?.ping ?? state.ping)?.latencyMs} {t('milliseconds')}</p>}
      {check?.probe && <p>{check.probe.protocol} · {check.probe.returnedModel ?? t('unknown')} · {check.probe.latencyMs} {
        t('milliseconds')}</p>}
      {check?.inventory && <DisclosureRow icon={null} title={
        `${t('catalog')} · ${check.inventory.models.length}`} open expandable={false} onToggle={() => { }}>
        <ul className={css.inventory}>{check.inventory.models.map(model => <li key={model.exactModelId}><code>{
          model.exactModelId}</code><Tag>{t(check.probe?.success &&
            check.probe.returnedModel === model.exactModelId ? 'tested' : 'unverified')}</Tag>{model.lifecycle && <span>{
          model.lifecycle}</span>}{model.shutdownDate && <time>{model.shutdownDate}</time>}</li>)}</ul>
        <p className={css.secondary}>{t('inventoryNotice')}</p>
      </DisclosureRow>}
      {!isV3 && draft.advanced?.baseUrl && <div className={css.form}>
        <label>{t('model')}<Input value={probeModel.trim()} disabled={state.busy} onChange={(event) => {
          setProbeModel(event.target.value)
        }} /></label>
        <label>{t('prompt')}<Input value={prompt} disabled={state.busy} onChange={(event) => { setPrompt(event.target.value) }} /></label>
        <p className={css.secondary}>{t('manualProbeCostNotice')}</p>
        <Button size="sm" variant="outline" disabled={state.busy || !probeModel.trim() ||
          !draft.advanced.protocol} onClick={probe}>{t('probe')}</Button>
        {!draft.advanced.protocol && <p className={css.secondary}>{t('selectProtocol')}</p>}
        {state.probe?.probes.map(result => <p key={result.protocol}>{result.protocol} · {
          result.returnedModel ?? t('unknown')} · {result.success ? t('tested') : t('connectionFailed')} · {
          result.latencyMs} {t('milliseconds')}</p>)}
      </div>}
      <ErrorNotice code={state.errorCode} t={t} />
      {state.pending && <p role="status">{t('pending')}</p>}
    </div>}
  </Modal>
}
