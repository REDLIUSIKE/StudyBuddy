import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {join,dirname,extname,resolve,relative,isAbsolute} from 'node:path';
import {projectFiles} from '../exports.mjs';
import {readable} from '../files.mjs';
import {assertStudioPath} from './context.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Reuse the original project-export list for a private, byte-verified render root. */
export async function createCapabilityExportSnapshot(root){
 const directory=join(root,'.film/cache/capability-export',randomUUID()),remove=()=>{assertStudioPath(directory,root);return rm(directory,{recursive:true,force:true});};
 try{
  assertStudioPath(directory,root);
  const entries=await projectFiles(root,[]),manifest=[];
  for(const entry of entries){
   const source=readable(root,entry.name);assertStudioPath(source,root);const before=await stat(source),bytes=await readFile(source),after=await stat(source);assertStudioPath(source,root);
   if(!before.isFile()||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw Error('VIDEO_EXPORT_SNAPSHOT_CHANGED');
   const path=resolve(directory,entry.name),back=relative(directory,path);if(isAbsolute(back)||back.startsWith('..'))throw Error('VIDEO_EXPORT_SNAPSHOT_INVALID');
   assertStudioPath(path,root);await mkdir(dirname(path),{recursive:true});assertStudioPath(path,root);await writeFile(path,bytes,{flag:'wx'});assertStudioPath(path,root);manifest.push({path:entry.name,sha256:hash(bytes),bytes:bytes.length});
  }
  const names=new Set(manifest.map(row=>row.path));
  for(const entry of manifest){
   if(!['.html','.css','.js','.mjs'].includes(extname(entry.path).toLowerCase()))continue;
   const text=await readFile(join(directory,entry.path),'utf8');
   const networkText=text.replace(/\bxmlns\s*=\s*(['"])http:\/\/www\.w3\.org\/2000\/svg\1/gi,'');
   if(/https?:\/\/|\bfetch\s*\(|\bimport\s*\(/i.test(networkText))throw Error('VIDEO_EXPORT_SNAPSHOT_EXTERNAL_DEPENDENCY');
   // A filter reference inside an inline SVG image belongs to that image, not
   // the surrounding project. Network checks above still inspect the data URI.
   const dependencyText=text.replace(/\burl\(\s*(['"])data:[\s\S]*?\1\s*\)/gi,'');
   const references=[...dependencyText.matchAll(/(?:\b(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^)'"\s]+))/gi)].map(match=>match[1]??match[2]);
   for(const ref of references){if(/^(?:#|data:|about:)/i.test(ref))continue;if(/^[a-z][a-z0-9+.-]*:|^[\\/]/i.test(ref))throw Error('VIDEO_EXPORT_SNAPSHOT_EXTERNAL_DEPENDENCY');
    const path=relative(directory,resolve(dirname(join(directory,entry.path)),ref.split(/[?#]/)[0])).replaceAll('\\','/');if(!names.has(path))throw Error('VIDEO_EXPORT_SNAPSHOT_DEPENDENCY_MISSING');}
  }
  const current=await projectFiles(root,[]);if(current.length!==entries.length)throw Error('VIDEO_EXPORT_SNAPSHOT_CHANGED');
  for(const entry of manifest)if(hash(await readFile(readable(root,entry.path)))!==entry.sha256)throw Error('VIDEO_EXPORT_SNAPSHOT_CHANGED');
  const film=manifest.find(row=>row.path==='film.html');if(!film)throw Error('VIDEO_EXPORT_SNAPSHOT_FILM_MISSING');
  return{root:directory,revision:film.sha256,files:manifest,remove};
 }catch(error){try{await remove();}catch{/* A swapped staging link is never followed for cleanup. */}throw error;}
}
