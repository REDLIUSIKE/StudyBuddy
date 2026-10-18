/** Private native output cache; request correlation and billing remain in the original journals. */
import {createHash,randomUUID} from 'node:crypto'
import {constants} from 'node:fs'
import {link,lstat,mkdir,open,realpath,rename,unlink,writeFile} from 'node:fs/promises'
import {basename,dirname,join,resolve} from 'node:path'
import {z} from 'zod'
import {mediaRequestUUID} from './media-key-journal.ts'
import type {MediaKeyRecord} from './media-key-journal.ts'
import {TtsTimingSchema} from './tts-timing.ts'
import type {TtsTiming} from './tts-timing.ts'
export interface StoredMediaAudio {mime:string;bytes:Uint8Array;timing?:TtsTiming;timingRequested?:boolean}
export interface MediaAudioStore {get(owner:string,row:MediaKeyRecord):Promise<StoredMediaAudio|null>;save(owner:string,row:MediaKeyRecord,result:StoredMediaAudio):Promise<void>}
const MAGIC=Buffer.from('SBAUD001'),MAX_BYTES=64*1024*1024,MAX_HEADER=2*1024*1024
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex'),invalid=():never=>{throw Error('AIGC_AUDIO_STORE_INVALID')}
const Header=z.strictObject({schemaVersion:z.literal(1),ownerHash:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.uuid(),modelId:z.string().min(1).max(256),inputHash:z.string().regex(/^[a-f0-9]{64}$/),mime:z.enum(['audio/wav','audio/mpeg','audio/flac','audio/ogg','audio/pcm']),bytes:z.number().int().min(1).max(MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/),timing:TtsTimingSchema.optional(),timingRequested:z.boolean().optional()})
const pending=new Map<string,Promise<unknown>>()
function audio(bytes:Buffer,mime:string):boolean{return mime==='audio/pcm'||mime==='audio/wav'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE'||mime==='audio/flac'&&bytes.toString('ascii',0,4)==='fLaC'||mime==='audio/ogg'&&bytes.toString('ascii',0,4)==='OggS'||mime==='audio/mpeg'&&(bytes.toString('ascii',0,3)==='ID3'||bytes[0]===255&&(bytes[1]!&224)===224)}
export class DiskMediaAudioStore implements MediaAudioStore {
 private canonicalRoot:string|undefined
 constructor(private readonly root:string){}
 private location(owner:string,row:MediaKeyRecord){
  if(!owner||owner.length>256||row.kind!=='audio'||!mediaRequestUUID(row.requestId)||!row.modelId||row.modelId.length>256||!/^[a-f0-9]{64}$/.test(row.inputHash))return invalid()
  const ownerHash=hash(owner),directory=join(resolve(this.root),ownerHash);return{ownerHash,directory,path:join(directory,row.requestId+'.audio')}
 }
 private async directory(directory:string,create:boolean):Promise<void>{
  if(create)await mkdir(this.root,{recursive:true,mode:0o700})
  const info=await lstat(this.root),actual=await realpath(this.root),parent=await realpath(dirname(resolve(this.root))),canonical=(path:string)=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path),expected=canonical(join(parent,basename(resolve(this.root))))
  if(!info.isDirectory()||info.isSymbolicLink()||canonical(actual)!==expected||this.canonicalRoot!==undefined&&this.canonicalRoot!==expected)return invalid();this.canonicalRoot=expected
  if(create)await mkdir(directory,{mode:0o700}).catch((error:NodeJS.ErrnoException)=>{if(error.code!=='EEXIST')throw error})
  const child=await lstat(directory);if(!child.isDirectory()||child.isSymbolicLink())return invalid()
 }
 async get(owner:string,row:MediaKeyRecord):Promise<StoredMediaAudio|null>{
  const {ownerHash,directory,path}=this.location(owner,row)
  try{
   await this.directory(directory,false);const before=await lstat(path);if(!before.isFile()||before.isSymbolicLink()||before.size<13||before.size>MAX_BYTES+MAX_HEADER+12)return invalid()
   const input=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let data:Buffer
   try{const stat=await input.stat();if(!stat.isFile()||stat.ino!==before.ino||stat.dev!==before.dev||stat.size!==before.size)return invalid();data=await input.readFile()}finally{await input.close()}
   if(!data.subarray(0,8).equals(MAGIC))return invalid();const length=data.readUInt32BE(8);if(length<1||length>MAX_HEADER||12+length>=data.length)return invalid()
   const parsed=Header.safeParse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(12,12+length))));if(!parsed.success)return invalid()
   const header=parsed.data,bytes=data.subarray(12+length)
   if(header.ownerHash!==ownerHash||header.requestId!==row.requestId||header.modelId!==row.modelId||header.inputHash!==row.inputHash||header.bytes!==bytes.length||header.sha256!==hash(bytes)||!audio(bytes,header.mime))return invalid()
   return{bytes:Buffer.from(bytes),mime:header.mime,...(header.timing?{timing:header.timing}:{}),...(header.timingRequested!==undefined?{timingRequested:header.timingRequested}:{})}
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error}
 }
 async save(owner:string,row:MediaKeyRecord,result:StoredMediaAudio):Promise<void>{
  const {ownerHash,directory,path}=this.location(owner,row),previous=pending.get(path)??Promise.resolve()
  const work=previous.catch(()=>{}).then(async()=>{
   if(!(result.bytes instanceof Uint8Array)||!result.bytes.length||result.bytes.length>MAX_BYTES)return invalid()
   const bytes=Buffer.from(result.bytes),sha256=hash(bytes),parsed=Header.safeParse({schemaVersion:1,ownerHash,requestId:row.requestId,modelId:row.modelId,inputHash:row.inputHash,mime:result.mime,bytes:bytes.length,sha256,...(result.timing?{timing:result.timing}:{}),...(result.timingRequested!==undefined?{timingRequested:result.timingRequested}:{})});if(!parsed.success||!audio(bytes,result.mime))return invalid()
   const existing=await this.get(owner,row);if(existing){if(existing.mime!==result.mime||hash(existing.bytes)!==sha256)return invalid();if(existing.timing){if(result.timing&&JSON.stringify(existing.timing)!==JSON.stringify(result.timing))return invalid();return}if(!result.timing)return}
   await this.directory(directory,true);const header=Buffer.from(JSON.stringify(parsed.data));if(header.length>MAX_HEADER)return invalid()
   const prefix=Buffer.alloc(12);MAGIC.copy(prefix);prefix.writeUInt32BE(header.length,8);const temporary=join(directory,randomUUID()+'.pending')
   await writeFile(temporary,Buffer.concat([prefix,header,bytes]),{flag:'wx',mode:0o600})
   try{
    const file=await open(temporary,'r+');try{await file.sync()}finally{await file.close()}
    if(existing)await rename(temporary,path)
    else try{await link(temporary,path)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const current=await this.get(owner,row);if(!current||current.mime!==result.mime||hash(current.bytes)!==sha256)return invalid()}
   }finally{await unlink(temporary).catch((error:NodeJS.ErrnoException)=>{if(error.code!=='ENOENT')throw error})}
  });pending.set(path,work);try{await work}finally{if(pending.get(path)===work)pending.delete(path)}
 }
}
