/** Media toolview: persistent keyless task reference, owned live status and browser-native previews. */
import {useEffect,useState} from 'react'
import type {Context} from '@deepseek-ai/cordis'
import type {PropsLocale} from '@deepseek-ai/dsh-client-ui-slots'
import {MEDIA_NS,type MediaKey} from '../../generated-images/locale.ts'
import type {ToolCallViewProps} from '../../contract/slots.ts'
import {mediaTaskModel,mediaTaskUrl} from '../models/media-generation-model.ts'
import type {MediaTaskModel} from '../models/media-generation-model.ts'
import styles from './media-generation-row.module.css'

const titles:Record<string,MediaKey>={generate_image:'tool.image',generate_video:'tool.video',generation_status:'tool.status'}
const status:Record<MediaTaskModel['state'],MediaKey>={queued:'task.queued',in_progress:'task.in_progress',completed:'task.completed',failed:'task.failed',unknown:'task.unknown'}
/** Rendering does not place binary image/video content in the reasoning model's request. */
export function MediaGenerationRow(props:ToolCallViewProps & PropsLocale<typeof MEDIA_NS>){
 const initial=props.phase==='result'&&!props.block.isError?mediaTaskModel(props.block.meta):null
 const [live,setLive]=useState<MediaTaskModel|null>(initial),[error,setError]=useState<MediaKey|undefined>()
 const key=initial?initial.sessionId+':'+initial.requestId+':'+initial.kind:''
 useEffect(()=>{
  setLive(initial);setError(undefined)
  if(!initial)return
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
  const query=async()=>{
   try{const response=await fetch(mediaTaskUrl(initial,'status'),{credentials:'same-origin',cache:'no-store',signal:controller.signal})
    if(!response.ok)throw Error('query');const next=mediaTaskModel(await response.json())
    if(!next||next.requestId!==initial.requestId||next.sessionId!==initial.sessionId||next.kind!==initial.kind||next.modelId!==initial.modelId)throw Error('invalid')
    if(controller.signal.aborted)return
    setLive(next);setError(undefined)
    if(next.state==='queued'||next.state==='in_progress')timer=setTimeout(()=>{void query()},3000)
   }catch{if(!controller.signal.aborted)setError('task.queryFailed')}
  }
  void query()
  return()=>{controller.abort();if(timer)clearTimeout(timer)}
 },[key])
 const task=live??initial,title=titles[props.toolName]??'tool.media',url=task?mediaTaskUrl(task,'content'):null
 return <div className={styles.root} data-media-task={task?.requestId}>
  <div className={styles.header}><span>{props.t(title)}</span><span className={styles.status}>{props.t(error??(task?status[task.state]:props.phase==='result'?'task.incomplete':'task.processing'))}</span></div>
  {task&&<div className={styles.model}>{task.modelId}</div>}
  {task?.state==='completed'&&task.contentAvailable&&url&&<div className={styles.result}>
   {task.kind==='image'?<img src={url} alt={props.t('image.alt')} loading="lazy" onError={()=>setError('image.loadFailed')}/>:<video src={url} controls preload="metadata" onError={()=>setError('video.loadFailed')}/>}
   <a href={url} download>{props.t(task.kind==='image'?'image.download':'video.download')}</a>
  </div>}
 </div>
}
export const mediaGenerationToolview={
 name:'studybuddy-media-toolview',inject:['slots'],
 apply(ctx:Context):void{ctx.slots.inject('tool.call.toolview',()=>{
  const disposers=['generate_image','generate_video','generation_status'].map(key=>ctx.slots.register({name:'tool.call.toolview',key,locale:MEDIA_NS},MediaGenerationRow))
  return()=>{for(const dispose of disposers)dispose()}
 })}
}
