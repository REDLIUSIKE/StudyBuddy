/** SSH/SFTP to the instance returned by AutoDL's authenticated snapshot; passwords remain private. */
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {Readable,Transform} from 'node:stream';import {pipeline} from 'node:stream/promises';import {fileURLToPath} from 'node:url';
import {Client,type SFTPWrapper} from 'ssh2';import type {AutoDLConnect,AutoDLRemote} from './types.ts';import {assertResearchPath} from '../runtime/project-storage.ts';
function quote(value:string){return "'"+value.replaceAll("'","'\\''")+"'";}
function safeRelative(value:string){if(!value||value.length>2048||value.includes('\\')||value.includes(':')||value.includes('\0')||value.startsWith('/')||value.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('AUTODL_REMOTE_PATH_DENIED');return value;}
export const connectAutoDL:AutoDLConnect=async(snapshot,options)=>{
 const connection=new Client();let verifierFailed=false;
 await new Promise<void>((resolve,reject)=>{
  const abort=()=>{connection.destroy();reject(Error('AUTODL_SSH_ABORTED'));};options.signal.addEventListener('abort',abort,{once:true});
  connection.once('ready',()=>{options.signal.removeEventListener('abort',abort);resolve();});
  connection.on('error',()=>{options.signal.removeEventListener('abort',abort);reject(Error(verifierFailed?'AUTODL_SSH_HOST_CHANGED':'AUTODL_SSH_FAILED'));});
  options.signal.throwIfAborted();connection.connect({host:snapshot.proxy_host,port:snapshot.ssh_port,username:'root',password:snapshot.root_password,readyTimeout:25000,keepaliveInterval:10000,keepaliveCountMax:3,hostHash:'sha256',hostVerifier:(key:string)=>{if(options.fingerprint&&key!==options.fingerprint){verifierFailed=true;return false;}try{if(!options.fingerprint)options.saveFingerprint(key);return true;}catch{verifierFailed=true;return false;}}});
 });
 const root='/root/autodl-tmp/studybuddy-'+options.jobId;
 let sftp:SFTPWrapper;
 try{sftp=await new Promise<SFTPWrapper>((resolve,reject)=>{const abort=()=>reject(Error('AUTODL_SSH_ABORTED'));options.signal.throwIfAborted();options.signal.addEventListener('abort',abort,{once:true});connection.sftp((error,value)=>{options.signal.removeEventListener('abort',abort);if(options.signal.aborted){value?.end();reject(Error('AUTODL_SSH_ABORTED'));}else if(error)reject(Error('AUTODL_SFTP_FAILED'));else resolve(value);});});}catch(error){connection.destroy();throw error;}
 const stat=(name:string)=>new Promise<import('ssh2').Stats>((resolve,reject)=>sftp.lstat(name,(error,info)=>error?reject(error):resolve(info)));
 const mkdir=async(name:string)=>{for(const segment of name.split('/').filter(Boolean).map((_,i,array)=>'/'+array.slice(0,i+1).join('/'))){try{const info=await stat(segment);if(!info.isDirectory()||info.isSymbolicLink())throw Error('AUTODL_REMOTE_PATH_DENIED');}catch(error){if((error as {code?:unknown}).code!==2)throw error;await new Promise<void>((resolve,reject)=>sftp.mkdir(segment,{mode:0o700},error=>error?reject(Error('AUTODL_REMOTE_MKDIR_FAILED')):resolve()));}}};
 const putBuffer=async(name:string,value:Buffer,signal:AbortSignal)=>{signal.throwIfAborted();await pipeline(ReadableBuffer(value),sftp.createWriteStream(name,{mode:0o600}),{signal});};
 const exec=(command:string,onLog:(stream:'stdout'|'stderr',chunk:Buffer)=>void,signal:AbortSignal)=>new Promise<number>((resolve,reject)=>{
  signal.throwIfAborted();connection.exec(command,(error,stream)=>{if(error){reject(Error('AUTODL_EXEC_UNAVAILABLE'));return;}const abort=()=>{stream.close();reject(Error('AUTODL_EXEC_ABORTED'));};signal.addEventListener('abort',abort,{once:true});stream.on('data',(chunk:Buffer)=>onLog('stdout',chunk));stream.stderr.on('data',(chunk:Buffer)=>onLog('stderr',chunk));stream.once('error',()=>{signal.removeEventListener('abort',abort);reject(Error('AUTODL_EXEC_FAILED'));});stream.once('close',(code:number|null)=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(Error('AUTODL_EXEC_ABORTED'));else if(code===null||!Number.isInteger(code))reject(Error('AUTODL_EXEC_STATUS_UNKNOWN'));else resolve(code);});if(signal.aborted)abort();});
 });
 try{await mkdir(root+'/.studybuddy');}catch(error){connection.end();throw error;}
 const remote:AutoDLRemote={
  async upload(files,signal){for(const file of files){signal.throwIfAborted();const target=root+'/'+safeRelative(file.remote);assertResearchPath(file.local);await mkdir(path.posix.dirname(target));await pipeline(fs.createReadStream(file.local),sftp.createWriteStream(target,{mode:0o600}),{signal});}},
  async execute(spec,onLog,signal){const runner=fileURLToPath(new URL('./runner.py',import.meta.url));await putBuffer(root+'/.studybuddy/runner.py',fs.readFileSync(runner),signal);await putBuffer(root+'/.studybuddy/request.json',Buffer.from(JSON.stringify(spec)),signal);return exec('cd '+quote(root)+' && python3 .studybuddy/runner.py',onLog,signal);},
  async cancel(signal){const code=await exec('cd '+quote(root)+' && python3 .studybuddy/runner.py cancel',()=>{},signal);if(code!==0)throw Error('AUTODL_REMOTE_CANCEL_FAILED');},
  async download(files,destination,signal){
   const output:{path:string;sha256:string;bytes:number}[]=[],seen=new Set<string>();let declaredTotal=0,receivedTotal=0;assertResearchPath(destination);
   const visit=async(relative:string)=>{
    safeRelative(relative);if(seen.has(relative))return;if(seen.size>=16384)throw Error('AUTODL_RESULT_LIMIT');seen.add(relative);signal.throwIfAborted();
    const name=root+'/'+relative;let info:import('ssh2').Stats;try{info=await stat(name);}catch(error){if((error as {code?:unknown}).code===2)return;throw Error('AUTODL_RESULT_READ_FAILED');}
    if(info.isSymbolicLink())throw Error('AUTODL_REMOTE_PATH_DENIED');
    if(info.isDirectory()){const rows=await new Promise<import('ssh2').FileEntry[]>((resolve,reject)=>sftp.readdir(name,(error,list)=>error?reject(Error('AUTODL_RESULT_READ_FAILED')):resolve(list)));for(const row of rows)if(!['.','..'].includes(row.filename))await visit(relative+'/'+row.filename);return;}
    if(!info.isFile()||!Number.isSafeInteger(info.size)||info.size<0||output.length>=4096||(declaredTotal+=info.size)>1073741824)throw Error('AUTODL_RESULT_LIMIT');
    const resolved=await new Promise<string>((resolve,reject)=>sftp.realpath(name,(error,value)=>error?reject(Error('AUTODL_RESULT_READ_FAILED')):resolve(value)));if(!resolved.startsWith(root+'/'))throw Error('AUTODL_REMOTE_PATH_DENIED');
    const target=path.join(destination,relative);assertResearchPath(target);fs.mkdirSync(path.dirname(target),{recursive:true});
    const temporary=target+'.'+randomUUID()+'.partial';assertResearchPath(temporary);const writer=fs.createWriteStream(temporary,{flags:'wx',mode:0o600}),hash=createHash('sha256');let size=0;
    const bounded=new Transform({transform(chunk:Buffer,_encoding,callback){size+=chunk.length;receivedTotal+=chunk.length;if(receivedTotal>1073741824)return callback(Error('AUTODL_RESULT_LIMIT'));if(size>info.size)return callback(Error('AUTODL_RESULT_CHANGED'));hash.update(chunk);callback(null,chunk);}});
    try{await pipeline(sftp.createReadStream(name),bounded,writer,{signal});if(size!==info.size)throw Error('AUTODL_RESULT_CHANGED');assertResearchPath(target);fs.renameSync(temporary,target);}
    catch(error){writer.destroy();assertResearchPath(temporary);if(fs.existsSync(temporary))fs.unlinkSync(temporary);throw error;}
    output.push({path:relative,bytes:size,sha256:hash.digest('hex')});
   };for(const file of files)await visit(file);return output;
  },
  close(){sftp.end();connection.end();},
 };return remote;
};
function ReadableBuffer(value:Buffer){return Readable.from([value]);}
