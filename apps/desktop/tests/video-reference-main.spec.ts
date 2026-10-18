import { it,expect } from 'vitest'
import { sanitizeVideoReference } from '../src/studybuddy/video-reference.ts'
it('keeps clip context while excluding signed URLs and refusing project traversal',()=>{
 const ref=sanitizeVideoReference({kind:'clip',id:'intro',label:'开场',src:'shots/intro.html',loc:'film.html#0.1',start:0,end:3,image:{src:'http://127.0.0.1:3333/film?key=private'}})
 expect(ref.files).toEqual(['shots/intro.html']);expect(ref.text).toContain('开场');expect(ref.text).not.toContain('private');expect(ref.text).not.toContain('http:')
 expect(()=>sanitizeVideoReference({kind:'file',path:'../secret.txt',fileKind:'text'})).toThrow('VIDEO_REFERENCE_INVALID')
 expect(()=>sanitizeVideoReference({kind:'time',time:NaN})).toThrow('VIDEO_REFERENCE_INVALID')
})
it('retains original remote clip context without treating its signed URL as a local attachment',()=>{
 const ref=sanitizeVideoReference({kind:'clip',src:'https://media.example/video.mp4?signature=private',label:'云端片段',start:0,end:3})
 expect(ref.files).toEqual([]);expect(ref.data.sourceKind).toBe('remote');expect(ref.text).not.toContain('private')
 const local=sanitizeVideoReference({kind:'clip',src:'./assets/My%20clip.mp4#t=1,3',start:1,end:3})
 expect(local.files).toEqual(['assets/My clip.mp4'])
 expect(()=>sanitizeVideoReference({kind:'clip',src:'assets/%2e%2e/%2e%2e/private.txt',start:0,end:1})).toThrow('VIDEO_REFERENCE_INVALID')
 const file=sanitizeVideoReference({kind:'file',path:'assets/take#1.png',fileKind:'image'})
 expect(file.files).toEqual(['assets/take#1.png'])
})
