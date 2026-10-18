import {lstat,realpath} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {realDestination} from './context.mjs';
const within=(root,path)=>{const rel=relative(root,path);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);};
function stable(root){try{return realpathSync.native(root)===root;}catch{return false;}}
async function selected(path,directory){
 if(typeof path!=='string'||!isAbsolute(path)||path.includes('\0'))throw new Error('VIDEO_PATH_DENIED');
 for(let ancestor=resolve(path);;ancestor=dirname(ancestor)){if((await lstat(ancestor)).isSymbolicLink())throw new Error('VIDEO_PATH_DENIED');if(dirname(ancestor)===ancestor)break;}
 const info=await lstat(path);if(directory?!info.isDirectory():!info.isFile()&&!info.isDirectory())throw new Error('VIDEO_PATH_DENIED');
 return{path:await realpath(path),directory:info.isDirectory()};
}
/** Private native selections grant project access, asset reads and export writes independently. */
export class VideoPathAdmissions {
 constructor(workspaceRoot){this.workspaceRoot=realpathSync.native(workspaceRoot);this.projects=new Set();this.assets=new Map();this.exports=new Map();}
 async admit(kind,paths,root){
  if(!['project','asset','export'].includes(kind)||!Array.isArray(paths)||!paths.length||paths.length>128||kind!=='project'&&typeof root!=='string')throw new Error('VIDEO_PATH_ADMISSION_INVALID');
  const entries=await Promise.all(paths.map(path=>selected(path,kind!=='asset')));
  if(kind==='project'){for(const entry of entries)this.projects.add(entry.path);}
  else{const map=kind==='asset'?this.assets:this.exports,prior=map.get(root)??[];map.set(root,[...prior,...entries.filter(entry=>!prior.some(old=>old.path===entry.path&&old.directory===entry.directory))]);}
 }
 projectPath(path){
  const target=realDestination(path);
  if(![this.workspaceRoot,...this.projects].some(root=>stable(root)&&within(root,target)))throw new Error('VIDEO_PROJECT_PATH_NOT_ADMITTED');
  return target;
 }
 async relocated(from,to){
  if(dirname(from)!==dirname(to)||!this.projects.has(from)&&![this.workspaceRoot,...this.projects].some(root=>stable(root)&&within(root,from)))throw new Error('VIDEO_PROJECT_PATH_NOT_ADMITTED');
  const target=await selected(to,true);if(target.path!==to)throw new Error('VIDEO_PATH_DENIED');
  this.projects.delete(from);this.projects.add(to);
  for(const map of [this.assets,this.exports]){const grants=map.get(from);if(grants){map.delete(from);map.set(to,grants);}}
 }
 allows(map,root,path){
  const target=realDestination(path);
  return stable(root)&&within(root,target)||(map.get(root)??[]).some(entry=>stable(entry.path)&&(entry.path===target||entry.directory&&within(entry.path,target)));
 }
 allowsImport(root,path){return this.allows(this.assets,root,path);}
 linkedMediaAdmissions(){return [...this.assets].map(([root,paths])=>({root,paths}));}
 assertImport(root,path){if(!this.allowsImport(root,path))throw new Error('VIDEO_IMPORT_PATH_NOT_ADMITTED');}
 assertExport(root,path){if(!this.allows(this.exports,root,path))throw new Error('VIDEO_EXPORT_PATH_NOT_ADMITTED');}
}
