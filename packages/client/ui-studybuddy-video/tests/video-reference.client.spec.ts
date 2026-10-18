import { it,expect } from 'vitest'
import type { VideoDraftPort } from '../src/client/video-reference.ts'
import { VideoReferenceImporter } from '../src/client/video-reference.ts'
it('appends project/frame references to an occupied draft once without submitting',()=>{
 let draft='Existing question',revision=1,submits=0
 const input={state:{getSnapshot:()=>({draft,draftRev:revision})},insert:({text,span}:{text:string,span:{start:number,end:number,draftRev:number}})=>{if(span.draftRev!==revision)return false;draft=draft.slice(0,span.start)+text+draft.slice(span.end);revision++;return true},submit:()=>{submits++}}
 const importer=new VideoReferenceImporter()
 const reference={id:'reference-1',text:'Clip intro at 1.25 seconds',files:['C:/workspace/frame.png']}
 expect(importer.insert(input as VideoDraftPort,reference)).toBe(true)
 expect(draft.startsWith('Existing question')).toBe(true);expect(draft).toContain('1.25 seconds');expect(draft).toContain('frame.png')
 const before=draft
 expect(importer.insert(input as VideoDraftPort,reference)).toBe(true)
 expect(draft).toBe(before);expect(submits).toBe(0)
})
it('keeps a rejected draft edit retryable instead of acknowledging it',()=>{
 const importer=new VideoReferenceImporter()
 let accept=false,count=0
 const input={state:{getSnapshot:()=>({draft:'',draftRev:1})},insert:()=>{count++;return accept}}
 const reference={id:'reference-2',text:'Frame',files:[]}
 expect(importer.insert(input as VideoDraftPort,reference)).toBe(false)
 accept=true
 expect(importer.insert(input as VideoDraftPort,reference)).toBe(true)
 expect(count).toBe(2)
})
