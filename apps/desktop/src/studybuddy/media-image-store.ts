import {createHash,randomUUID} from 'node:crypto'
import {link,lstat,mkdir,open,realpath,unlink,writeFile} from 'node:fs/promises'
import {constants} from 'node:fs'
import {basename,dirname,join,resolve} from 'node:path'
import {mediaRequestUUID} from './media-key-journal.ts'
import type {MediaKeyRecord} from './media-key-journal.ts'

export interface StoredMediaImage {mime:'image/png'|'image/jpeg'|'image/webp';base64:string}
export interface MediaImageStore {
 get(owner:string,row:MediaKeyRecord):Promise<StoredMediaImage|null>
 save(owner:string,row:MediaKeyRecord,content:StoredMediaImage):Promise<void>
}
const MAGIC=Buffer.from('SBIMG001'),MAX_BYTES=16*1024*1024,MAX_HEADER=4096
const invalid=():never=>{throw Error('AIGC_IMAGE_STORE_INVALID')}
const digest=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex')
function validImage(bytes:Buffer,mime:StoredMediaImage['mime']):boolean {
 return mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
  mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
  mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
}
/** Account-owned output files, separate from the keyless request and reasoning journals. */
export class DiskMediaImageStore implements MediaImageStore {
 private canonicalRoot:string|undefined
 constructor(private readonly root:string){}
 private location(owner:string,row:MediaKeyRecord){
  if(!owner||owner.length>256||row.kind!=='image'||!mediaRequestUUID(row.requestId)||
   typeof row.modelId!=='string'||!row.modelId||row.modelId.length>256||!/^[a-f0-9]{64}$/.test(row.inputHash))return invalid()
  const ownerHash=digest(owner),directory=join(resolve(this.root),ownerHash)
  return{ownerHash,directory,path:join(directory,row.requestId+'.image')}
 }
 private async directory(directory:string,create:boolean){
  if(create)await mkdir(this.root,{recursive:true,mode:0o700})
  const root=await lstat(this.root),actual=await realpath(this.root),parent=await realpath(dirname(resolve(this.root)))
  const canonical=(path:string)=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path)
  // Windows packaged processes can redirect AppData ancestors. Trust the
  // configured parent's resolved location, while rejecting a redirected root.
  const expected=canonical(join(parent,basename(resolve(this.root))))
  if(!root.isDirectory()||root.isSymbolicLink()||canonical(actual)!==expected||
   (this.canonicalRoot!==undefined&&this.canonicalRoot!==expected))return invalid()
  this.canonicalRoot=expected
  if(create)await mkdir(directory,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error})
  const owner=await lstat(directory)
  if(!owner.isDirectory()||owner.isSymbolicLink())return invalid()
 }
 async get(owner:string,row:MediaKeyRecord):Promise<StoredMediaImage|null>{
  const{ownerHash,directory,path}=this.location(owner,row)
  try{
   await this.directory(directory,false)
   const stat=await lstat(path)
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size<13||stat.size>MAX_BYTES+MAX_HEADER+12)return invalid()
   const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0))
   let data:Buffer
   try{
    const current=await file.stat()
    if(!current.isFile()||current.size!==stat.size||current.ino!==stat.ino||current.dev!==stat.dev)return invalid()
    data=await file.readFile()
   }finally{await file.close()}
   if(!data.subarray(0,8).equals(MAGIC))return invalid()
   const size=data.readUInt32BE(8)
   if(size<1||size>MAX_HEADER||12+size>=data.length)return invalid()
   const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(12,12+size))) as Record<string,unknown>
   if(!metadata||Array.isArray(metadata)||Object.keys(metadata).sort().join(',')!=='bytes,inputHash,mime,modelId,ownerHash,requestId,schemaVersion,sha256'||
    metadata.schemaVersion!==1||metadata.ownerHash!==ownerHash||metadata.requestId!==row.requestId||
    metadata.modelId!==row.modelId||metadata.inputHash!==row.inputHash)return invalid()
   const bytes=data.subarray(12+size),mime=metadata.mime as StoredMediaImage['mime']
   if(bytes.length>MAX_BYTES||metadata.bytes!==bytes.length||metadata.sha256!==digest(bytes)||!validImage(bytes,mime))return invalid()
   return{mime,base64:bytes.toString('base64')}
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw Error('AIGC_IMAGE_STORE_INVALID')}
 }
 async save(owner:string,row:MediaKeyRecord,content:StoredMediaImage):Promise<void>{
  const{ownerHash,directory,path}=this.location(owner,row)
  if(typeof content.base64!=='string'||content.base64.length>Math.ceil(MAX_BYTES/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(content.base64))return invalid()
  const bytes=Buffer.from(content.base64,'base64')
  if(!bytes.length||bytes.length>MAX_BYTES||bytes.toString('base64')!==content.base64||!validImage(bytes,content.mime))return invalid()
  const old=await this.get(owner,row)
  if(old){if(old.mime!==content.mime||old.base64!==content.base64)return invalid();return}
  await this.directory(directory,true)
  const header=Buffer.from(JSON.stringify({schemaVersion:1,ownerHash,requestId:row.requestId,modelId:row.modelId,
   inputHash:row.inputHash,mime:content.mime,bytes:bytes.length,sha256:digest(bytes)}))
  if(header.length>MAX_HEADER)return invalid()
  const prefix=Buffer.alloc(12);MAGIC.copy(prefix);prefix.writeUInt32BE(header.length,8)
  const temporary=join(directory,randomUUID()+'.pending')
  await writeFile(temporary,Buffer.concat([prefix,header,bytes]),{flag:'wx',mode:0o600})
  try{
   // Publish the header and bytes together, without replacing an existing task result.
   const pending=await open(temporary,'r+')
   try{await pending.sync()}finally{await pending.close()}
   try{await link(temporary,path)}catch(error){
    if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error
    const existing=await this.get(owner,row)
    if(!existing||existing.mime!==content.mime||existing.base64!==content.base64)return invalid()
   }
  }finally{await unlink(temporary)}
 }
}
