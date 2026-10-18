import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar'
import type { InputState,InsertTextRequest } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { VideoReference } from './video-controller.ts'
export interface VideoDraftPort {
 state:{getSnapshot():Pick<InputState,'draft'|'draftRev'>}
 insert(request:InsertTextRequest):boolean
}
/** Retry acknowledgement without inserting the same reference into a draft twice. */
export class VideoReferenceImporter {
 private readonly applied=new Set<string>()
 insert(input:VideoDraftPort,reference:VideoReference):boolean{
  if(this.applied.has(reference.id))return true
  const tokens=reference.files.map(path=>formatFileMention({path,kind:'file'},false))
  if(tokens.some(token=>token===undefined))return false
  const state=input.state.getSnapshot()
  const text=(state.draft&&!state.draft.endsWith('\n')?'\n':'')+[reference.text,...tokens].filter(Boolean).join('\n')
  if(!input.insert({text,span:{start:state.draft.length,end:state.draft.length,draftRev:state.draftRev}}))return false
  this.applied.add(reference.id);return true
 }
 clear():void{this.applied.clear()}
}
