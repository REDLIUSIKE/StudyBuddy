import { it,expect } from 'vitest'
import { videoReferenceImagePlan,materializeVideoReferenceImage } from '../src/studybuddy/video-reference-image.ts'
const editor='http://127.0.0.1:4567'
const viewer={projectId:'p',time:1.25,rect:{x:20,y:30,width:640,height:360}}
it('uses only the admitted project frame endpoint and excludes credentials or arbitrary destinations',()=>{
 const plan=videoReferenceImagePlan({kind:'clip',image:{src:'/api/projects/p/media?what=frame&path=assets%2Ftake.png&ms=100&w=640'}},'p',editor)
 expect(plan).toMatchObject({kind:'frame',url:editor+'/api/projects/p/media?what=frame&path=assets%2Ftake.png&ms=100&w=640'})
 for(const src of ['https://example.org/api/projects/p/media?what=frame&path=x&ms=0&w=640','/api/projects/other/media?what=frame&path=x&ms=0&w=640','/api/projects/p/media?what=frame&path=..%2Fprivate&ms=0&w=640','/api/projects/p/media?what=frame&path=x&ms=0&w=640&key=private']){
  expect(()=>videoReferenceImagePlan({image:{src}},'p',editor)).toThrow('VIDEO_REFERENCE_IMAGE_INVALID')
 }
})
it('captures the viewer or selected region at its actual frame geometry',()=>{
 expect(videoReferenceImagePlan({kind:'time',time:1.25,image:{viewer:true}},'p',editor,viewer)).toEqual({kind:'viewer',snapshot:viewer})
 const region=videoReferenceImagePlan({kind:'region',time:1.25,image:{viewer:true,stage:{w:1920,h:1080},crop:{x:960,y:0,w:960,h:540}}},'p',editor,viewer)
 expect(region).toMatchObject({kind:'viewer',crop:{x:0.5,y:0,w:0.5,h:0.5}})
 expect(()=>videoReferenceImagePlan({image:{viewer:true}},'other',editor,viewer)).toThrow('VIDEO_SCOPE_REVOKED')
 expect(()=>videoReferenceImagePlan({image:{viewer:true,crop:{x:-1,y:0,w:1,h:1},stage:{w:10,h:10}}},'p',editor,viewer)).toThrow('VIDEO_REFERENCE_IMAGE_INVALID')
})
it('discards captures whose project or playhead changed and bounds decoded and fetched images',async()=>{
 let current=true,snapshot=viewer,fetches=0,crops:unknown[]=[]
 const image={isEmpty:()=>false,getSize:()=>({width:1280,height:720}),toPNG:()=>Buffer.from('normalized-png'),crop:(rect:unknown)=>{crops.push(rect);return image}}
 const ports={current:()=>current,snapshot:async()=>snapshot,capture:async()=>image,decode:()=>image,fetch:async()=>{fetches++;return new Response(Buffer.from('source-jpeg'),{headers:{'content-type':'image/jpeg'}})}}
 const plan=videoReferenceImagePlan({image:{viewer:true,stage:{w:1920,h:1080},crop:{x:960,y:0,w:960,h:540}}},'p',editor,viewer)!
 expect(await materializeVideoReferenceImage(plan,ports)).toEqual(Buffer.from('normalized-png'))
 expect(crops).toEqual([{x:640,y:0,width:640,height:360}]);expect(fetches).toBe(0)
 snapshot={...viewer,time:2};await expect(materializeVideoReferenceImage(plan,ports)).rejects.toThrow('VIDEO_SCOPE_REVOKED')
 snapshot=viewer;current=false;await expect(materializeVideoReferenceImage(plan,ports)).rejects.toThrow('VIDEO_SCOPE_REVOKED')
 current=true
 const frame=videoReferenceImagePlan({image:{src:'/api/projects/p/media?what=poster&path=assets%2Fx.png'}},'p',editor)!
 await expect(materializeVideoReferenceImage(frame,{...ports,fetch:async()=>new Response('x',{headers:{'content-type':'image/svg+xml'}})})).rejects.toThrow('VIDEO_REFERENCE_IMAGE_INVALID')
 await expect(materializeVideoReferenceImage(frame,{...ports,decode:()=>({...image,getSize:()=>({width:40000,height:40000})})})).rejects.toThrow('VIDEO_REFERENCE_IMAGE_INVALID')
 let cancelled=false
 await expect(materializeVideoReferenceImage(frame,{...ports,fetch:async()=>{current=false;return new Response(new ReadableStream({cancel(){cancelled=true}}),{headers:{'content-type':'image/jpeg'}})}})).rejects.toThrow('VIDEO_SCOPE_REVOKED')
 expect(cancelled).toBe(true)
})
