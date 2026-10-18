import { lstat } from 'node:fs/promises'
import { dirname,isAbsolute,resolve } from 'node:path'
/** Main admits immutable resources and private data without following junctions. */
export async function assertVideoPath(value:string):Promise<void>{
 if(!isAbsolute(value))throw Error('VIDEO_PATH_DENIED')
 for(let current=resolve(value);;current=dirname(current)){
  const info=await lstat(current).catch((error:unknown)=>{if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return undefined;throw error})
  if(info?.isSymbolicLink())throw Error('VIDEO_PATH_DENIED')
  if(dirname(current)===current)return
 }
}
