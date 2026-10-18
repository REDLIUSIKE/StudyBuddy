import { readFile,stat } from 'node:fs/promises';
import { basename,dirname,join } from 'node:path';
/** Imports of one Windows PE image, including delay imports. Data only; no binary is executed. */
export function peImports(bytes){
 if(bytes.toString('ascii',0,2)!=='MZ')throw Error('Expected a Windows PE image');
 const pe=bytes.readUInt32LE(0x3c);
 if(bytes.toString('ascii',pe,pe+4)!=='PE\0\0')throw Error('Invalid PE signature');
 const sections=bytes.readUInt16LE(pe+6),optional=pe+24,size=bytes.readUInt16LE(pe+20),magic=bytes.readUInt16LE(optional);
 const directories=optional+(magic===0x20b?112:magic===0x10b?96:(()=>{throw Error('Unsupported PE format');})());
 const table=optional+size;
 const offset=rva=>{
  if(!rva)return 0;
  for(let i=0;i<sections;i++){const s=table+i*40,virtual=bytes.readUInt32LE(s+12),length=Math.max(bytes.readUInt32LE(s+8),bytes.readUInt32LE(s+16));if(rva>=virtual&&rva<virtual+length)return bytes.readUInt32LE(s+20)+rva-virtual;}
  throw Error('PE address is outside its sections');
 };
 const cstring=at=>{const end=bytes.indexOf(0,at);if(end<at||end-at>1024)throw Error('Invalid PE import name');return bytes.toString('ascii',at,end);};
 const names=new Set();
 for(const[index,width,nameField]of[[1,20,12],[13,32,4]]){
  let at=offset(bytes.readUInt32LE(directories+index*8));if(!at)continue;
  for(let count=0;count<4096;count++,at+=width){const descriptor=bytes.subarray(at,at+width);if(descriptor.length!==width)throw Error('Truncated PE import');if(descriptor.every(value=>value===0))break;
   const name=cstring(offset(bytes.readUInt32LE(at+nameField)));if(!/^[a-z0-9_.-]+\.dll$/i.test(name))throw Error('Unsafe PE import');names.add(name);
  }
 }
 return[...names];
}
/** Keep only the exact Git executable and recursively required local DLLs; OS libraries stay with Windows. */
export async function windowsProgramClosure(executable,systemDirectory){
 const rows=[],seen=new Set(),queue=[executable],directory=dirname(executable);
 while(queue.length){
  const path=queue.shift(),name=basename(path).toLowerCase();if(seen.has(name))continue;seen.add(name);
  const bytes=await readFile(path);rows.push({path,bytes});
  for(const imported of peImports(bytes)){
   const local=join(directory,imported),exists=await stat(local).then(value=>value.isFile(),()=>false);
   if(exists){queue.push(local);continue;}
   if(/^(api-ms-win-|ext-ms-win-)/i.test(imported))continue;
   if(!await stat(join(systemDirectory,imported)).then(value=>value.isFile(),()=>false))throw Error('Unresolved Windows dependency: '+imported);
  }
 }
 return rows;
}
