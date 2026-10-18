import {useState} from 'react'
import type {Context} from '@deepseek-ai/cordis'
import type {PropsLocale,TranslateNS} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {ToolCallViewProps} from '../../contract/slots.ts'
import {CONVERSATION_NS} from '../../locale.ts'
import {MEDIA_NS} from '../../generated-images/locale.ts'
import {creativeProjectAction} from '../models/creative-project-model.ts'
import {GenericToolCard} from './GenericToolCard.tsx'
import css from './creative-project-row.module.css'

export function CreativeProjectRow(props:ToolCallViewProps&PropsLocale<typeof CONVERSATION_NS>&{projectT:TranslateNS<typeof MEDIA_NS>}){
 const action=props.phase==='result'&&!props.block.isError?creativeProjectAction(props.block.meta):null
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false)
 const open=async()=>{
  if(!action||busy)return
  setBusy(true);setFailed(false)
  try{const host=Reflect.get(window,'studybuddy') as {capabilities?:{openProject?(id:string):Promise<unknown>}}|undefined
   if(!host?.capabilities?.openProject)throw Error('CAPABILITY_OPEN_UNAVAILABLE')
   await host.capabilities.openProject(action.id)
  }catch{setFailed(true)}finally{setBusy(false)}
 }
 return <><GenericToolCard {...props}/>{action&&<div className={css.actions}><button type="button" onClick={()=>{void open()}} disabled={busy}>{props.projectT(busy?'project.opening':'project.open')}</button>{failed&&<span role="status">{props.projectT('project.unavailable')}</span>}</div>}</>
}
export const creativeProjectToolview={name:'studybuddy-creative-project-toolview',inject:['slots','locale'],apply(ctx:Context):void{
 ctx.slots.inject('tool.call.toolview',()=>ctx.slots.register({name:'tool.call.toolview',key:'creative_project',locale:CONVERSATION_NS},props=><CreativeProjectRow {...props} projectT={ctx.locale.bind(MEDIA_NS)}/>))
}}
