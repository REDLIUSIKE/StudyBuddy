import { videoRelativePath } from './video-reference.ts'

export interface VideoImageRect { x:number;y:number;width:number;height:number }
export interface VideoViewerSnapshot { projectId:string;time:number;rect:VideoImageRect }
export interface VideoPixelImage {
 isEmpty():boolean
 getSize():{width:number;height:number}
 crop(rect:VideoImageRect):VideoPixelImage
 toPNG():Uint8Array
}
type Crop={x:number;y:number;w:number;h:number}
export type VideoReferenceImagePlan=
 | {kind:'frame';url:string}
 | {kind:'viewer';snapshot:VideoViewerSnapshot;crop?:Crop}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const invalid=():never=>{throw Error('VIDEO_REFERENCE_IMAGE_INVALID')}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
const limit=16*1024*1024

/** Accept original Studio image references only within the current project and editor. */
export function videoReferenceImagePlan(reference:unknown,projectId:string,editorOrigin:string,viewer?:unknown):VideoReferenceImagePlan|null{
 if(!record(reference)||reference.image===undefined)return null
 const image=reference.image
 if(!record(image)||Object.keys(image).some(k=>!['src','viewer','crop','stage'].includes(k)))return invalid()
 if(image.viewer===true){
  if(!record(viewer)||viewer.projectId!==projectId)throw Error('VIDEO_SCOPE_REVOKED')
  const r=viewer.rect
  if(!finite(viewer.time)||viewer.time<0||!record(r)||!['x','y','width','height'].every(k=>finite(r[k])&&Number.isInteger(r[k]))||
    Number(r.x)<0||Number(r.y)<0||Number(r.width)<1||Number(r.height)<1||Number(r.x)+Number(r.width)>32768||Number(r.y)+Number(r.height)>32768||Number(r.width)*Number(r.height)>32*1024*1024)return invalid()
  const snapshot:VideoViewerSnapshot={projectId,time:viewer.time,rect:{x:Number(r.x),y:Number(r.y),width:Number(r.width),height:Number(r.height)}}
  if(image.crop===undefined)return{kind:'viewer',snapshot}
  const c=image.crop,s=image.stage
  if(!record(c)||!record(s)||!['x','y','w','h'].every(k=>finite(c[k]))||!finite(s.w)||!finite(s.h)||s.w<=0||s.h<=0||
   Number(c.x)<0||Number(c.y)<0||Number(c.w)<=0||Number(c.h)<=0||Number(c.x)+Number(c.w)>s.w||Number(c.y)+Number(c.h)>s.h)return invalid()
  return{kind:'viewer',snapshot,crop:{x:Number(c.x)/s.w,y:Number(c.y)/s.h,w:Number(c.w)/s.w,h:Number(c.h)/s.h}}
 }
 if(typeof image.src!=='string'||image.src.length>8192||!URL.canParse(image.src,editorOrigin))return invalid()
 const url=new URL(image.src,editorOrigin)
 if(url.origin!==editorOrigin||url.username||url.password||url.hash||url.pathname!==`/api/projects/${encodeURIComponent(projectId)}/media`||
  [...url.searchParams.keys()].some(k=>!['what','path','ms','w','v','clip'].includes(k))||[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1)||
  !['poster','frame'].includes(url.searchParams.get('what')??''))return invalid()
 try{videoRelativePath(url.searchParams.get('path'))}catch{return invalid()}
 if(url.searchParams.get('what')==='frame'&&(!/^\d+$/.test(url.searchParams.get('ms')??'')||!/^\d+$/.test(url.searchParams.get('w')??'')||Number(url.searchParams.get('w'))<1||Number(url.searchParams.get('w'))>4096))return invalid()
 return{kind:'frame',url:url.href}
}

interface ImagePorts {
 current():boolean
 snapshot():Promise<unknown>
 capture(rect:VideoImageRect):Promise<VideoPixelImage>
 decode(bytes:Uint8Array):VideoPixelImage
 fetch(url:string):Promise<Response>
}
/** Normalize to bounded PNG and discard any capture completed after its viewer changed. */
export async function materializeVideoReferenceImage(plan:VideoReferenceImagePlan,ports:ImagePorts):Promise<Uint8Array>{
 const check=():void=>{if(!ports.current())throw Error('VIDEO_SCOPE_REVOKED')}
 const same=async():Promise<void>=>{check();if(JSON.stringify(await ports.snapshot())!==JSON.stringify(plan.kind==='viewer'?plan.snapshot:null))throw Error('VIDEO_SCOPE_REVOKED');check()}
 check()
 let image:VideoPixelImage
 if(plan.kind==='viewer'){
  await same();image=await ports.capture(plan.snapshot.rect);await same()
 }else{
  const response=await ports.fetch(plan.url)
  try{check()}catch(error){await response.body?.cancel().catch(()=>{});throw error}
  const length=response.headers.get('content-length')
  if(!response.ok||!response.body||!['image/png','image/jpeg','image/webp'].includes(response.headers.get('content-type')?.split(';')[0]??'')||
    length&&(!/^\d+$/.test(length)||Number(length)>limit)){
   await response.body?.cancel();return invalid()
  }
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
  try{
   for(;;){const next=await reader.read();if(next.done)break;check();size+=next.value.byteLength;if(size>limit)return invalid();chunks.push(next.value)}
   image=ports.decode(Buffer.concat(chunks));check()
  }catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
 }
 const size=image.getSize()
 if(image.isEmpty()||size.width<1||size.height<1||size.width>8192||size.height>8192||size.width*size.height>32*1024*1024)return invalid()
 if(plan.kind==='viewer'&&plan.crop){
  const c=plan.crop,x=Math.floor(c.x*size.width),y=Math.floor(c.y*size.height)
  image=image.crop({x,y,width:Math.min(size.width-x,Math.max(1,Math.ceil(c.w*size.width))),height:Math.min(size.height-y,Math.max(1,Math.ceil(c.h*size.height)))})
 }
 const png=image.toPNG();check()
 if(!png.byteLength||png.byteLength>limit)return invalid()
 return png
}
