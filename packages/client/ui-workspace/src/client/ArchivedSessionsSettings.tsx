/** Discover and restore archived records through the existing current-Host registry. */
import {useState} from 'react'
import {Button,Input} from '@deepseek-ai/dsh-client-ui-primitives'
import type {GlobalStandardProps,PropsLocale} from '@deepseek-ai/dsh-client-ui-slots'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import {workspaceDisplayTitle} from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import css from './ArchivedSessionsSettings.module.css'

/** Metadata hooks do not acquire or open archived Session generations. */
export type ArchivedSessionsSettingsProps=Pick<GlobalStandardProps,'useSessions'|'useWorkspaces'> & PropsLocale<'workspace'> & {
  unarchiveSession:(sessionId:SessionId)=>Promise<void>
}

/** Show the complete archive set, including cold rows whose display metadata is not yet available. */
export function ArchivedSessionsSettings({useSessions,useWorkspaces,unarchiveSession,t}:ArchivedSessionsSettingsProps){
  const sessions=useSessions(state=>state),workspaces=useWorkspaces(state=>state)
  const [query,setQuery]=useState(''),[busy,setBusy]=useState<SessionId|null>(null)
  const [notice,setNotice]=useState<'restored'|'failed'|null>(null)
  const normalized=query.trim().toLocaleLowerCase()
  const rows=workspaces.archivedSessionIds.map(id=>({id,title:sessions.byId[id]?.displayTitle||id,
    workspace:workspaces.items.find(workspace=>workspace.sessionIds.includes(id))}))
    .filter(row=>!normalized||row.title.toLocaleLowerCase().includes(normalized)||row.id.toLocaleLowerCase().includes(normalized))
  const loading=sessions.phase!=='ready'||workspaces.phase!=='ready'
  const restore=async(id:SessionId):Promise<void>=>{
    if(busy!==null)return
    setBusy(id);setNotice(null)
    try{await unarchiveSession(id);setNotice('restored')}
    catch{setNotice('failed')}
    finally{setBusy(null)}
  }
  return <section className={css.root} data-workspace-archived-settings>
    <h2>{t('archive.settings')}</h2>
    <Input aria-label={t('archive.search')} placeholder={t('archive.search')} value={query}
      onChange={event=>{setQuery(event.target.value)}}/>
    {loading&&<p role="status">{t('loading')}</p>}
    {workspaces.error&&<p role="alert">{workspaces.error.message}</p>}
    {notice==='failed'&&<p role="alert">{t('archive.restoreFailed')}</p>}
    {notice==='restored'&&<p role="status">{t('archive.restored')}</p>}
    {!loading&&!workspaces.error&&rows.length===0&&<p className={css.empty}>{t(normalized?'empty.noMatches':'empty.noneArchived')}</p>}
    <ul className={css.list}>{rows.map(row=><li key={row.id} className={css.row}>
      <div className={css.metadata}><span className={css.title}>{row.title}</span>
        <span className={css.workspace}>{row.workspace?workspaceDisplayTitle(row.workspace.title,t('workspace.defaultName')):t('group.ungrouped')}</span>
      </div>
      <Button size="sm" variant="outline" disabled={busy!==null} aria-busy={busy===row.id}
        aria-label={t('archive.restoreNamed',{title:row.title})} onClick={()=>{void restore(row.id)}}>{t('menu.unarchiveSession')}</Button>
    </li>)}</ul>
  </section>
}
