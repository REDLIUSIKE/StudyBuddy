import {createHash} from 'node:crypto';
import {join,basename} from 'node:path';
import {mkdir,readdir,readFile} from '@toonflow/file';
import {z} from 'zod';
import {admitWorkspace,denyLinks} from '@/utils/studyBuddy/policy';
import {writeWorkspaceFile,resolveWorkspacePath} from '@/utils/workspace/files';
import {fileCoordinator} from './filePolicy';
const ref=(root:string)=>'aigc-'+createHash('sha256').update(root).digest('hex').slice(0,48);
const request=z.discriminatedUnion('action',[
 z.strictObject({operation:z.literal('capability-project'),action:z.literal('list')}),
 z.strictObject({operation:z.literal('capability-project'),action:z.literal('create'),title:z.string().trim().min(1).max(160)}),
 z.strictObject({operation:z.literal('capability-project'),action:z.literal('resolve'),projectRef:z.string().regex(/^aigc-[a-f0-9]{48}$/)}),
]);
/** Reuses original workspace layout and exclusive file writer, without another project index. */
export async function capabilityProject(input:unknown,workspaceRoot:string,signal:AbortSignal){
 const ask=request.parse(input),home=await admitWorkspace(workspaceRoot);signal.throwIfAborted();
 if(ask.action==='create'){
  const name=ask.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').replace(/^[.\s]+/,'').trim().slice(0,120);if(!name)throw Error('AIGC_PROJECT_INVALID');
  for(let index=1;index<=1000;index++){
   const directory=join(home,name+(index===1?'':' '+index));await denyLinks(directory);signal.throwIfAborted();
   try{await mkdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')continue;throw error;}
   const root=await admitWorkspace(directory);await writeWorkspaceFile(join(root,'画布1.json'),JSON.stringify({toonflowCanvas:true,nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}}),true);signal.throwIfAborted();
   return{projectRef:ref(root),directory:root,title:basename(root)};
  }throw Error('AIGC_PROJECT_LIMIT');
 }
 const projects=[];
 for(const entry of await readdir(home,{withFileTypes:true})){if(!entry.isDirectory()||entry.name.startsWith('.'))continue;const directory=await admitWorkspace(join(home,entry.name));projects.push({projectRef:ref(directory),directory,title:entry.name});}
 signal.throwIfAborted();if(ask.action==='list')return{projects};
 const project=projects.find(row=>row.projectRef===ask.projectRef);if(!project)throw Error('AIGC_PROJECT_NOT_FOUND');return project;
}
const imported=z.strictObject({operation:z.literal('capability-import'),directory:z.string(),relativeSource:z.string().regex(/^\.studybuddy-capability-import\/[a-f0-9-]{36}\.tmp$/),name:z.string().min(1).max(240),bytes:z.number().int().positive().max(100*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/),mime:z.string()});
export async function capabilityImport(input:unknown,signal:AbortSignal){
 const ask=imported.parse(input),root=await admitWorkspace(ask.directory),source=await resolveWorkspacePath(root,ask.relativeSource),bytes=await readFile(source.path);
 signal.throwIfAborted();if(bytes.length!==ask.bytes||createHash('sha256').update(bytes).digest('hex')!==ask.sha256)throw Error('AIGC_IMPORT_INVALID');
 const name=ask.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').replace(/^[.\s]+/,'').trim();if(!name)throw Error('AIGC_IMPORT_INVALID');
 for(let index=1;index<=1000;index++){
  const relativePath='assets/'+(index===1?name:ask.sha256.slice(0,12)+'-'+index+'-'+name),target=await resolveWorkspacePath(root,relativePath,true);
  const previous=await readFile(target.path).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error;});
  if(previous){if(previous.equals(bytes))return{relativePath,sha256:ask.sha256,mime:ask.mime,reused:true};continue;}
  await fileCoordinator(root).beforeWrite([target.path],bytes);await mkdir(join(root,'assets'),{recursive:true});signal.throwIfAborted();
  try{await writeWorkspaceFile(target.path,bytes,true);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')continue;throw error;}
  return{relativePath,sha256:ask.sha256,mime:ask.mime,reused:false};
 }throw Error('AIGC_IMPORT_LIMIT');
}
