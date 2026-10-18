/** Actual SSH/SFTP wire fixture. Remote exec is recorded, not claimed as a real GPU/Linux run. */
import fs from 'node:fs';import path from 'node:path';import {generateKeyPairSync} from 'node:crypto';import {Server,utils} from 'ssh2';import type {AddressInfo} from 'node:net';
export async function autoDLWireServer(root:string,options:{reportedOutputSize?:number}={}){
 const key=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
 const commands:string[]=[],clients:Set<any>=new Set();
 const server=new Server({hostKeys:[key]},client=>{clients.add(client);client.on('close',()=>clients.delete(client));client.on('error',()=>{});
  client.on('authentication',ctx=>{if(ctx.method==='password'&&ctx.username==='root'&&ctx.password==='fixture-password')ctx.accept();else ctx.reject();}).on('ready',()=>client.on('session',accept=>{const session=accept();
   session.on('exec',(accept,_reject,info)=>{const stream=accept();commands.push(info.command);const match=/\/root\/autodl-tmp\/studybuddy-([a-f0-9-]{36})/.exec(info.command);if(!match){stream.exit(1);stream.end();return;}const job=path.join(root,'studybuddy-'+match[1]);if(!info.command.endsWith(' cancel')){fs.mkdirSync(path.join(job,'results'),{recursive:true});fs.writeFileSync(path.join(job,'results/figure.txt'),'wire-result');stream.write('wire-stdout');stream.stderr.write('wire-stderr');}stream.exit(0);stream.end();});
   session.on('sftp',accept=>{const sftp=accept(),code=utils.sftp.STATUS_CODE,handles=new Map<string,{fd?:number;entries?:string[];directory?:string}>();let next=0;
    const local=(remote:string)=>{if(remote==='/')return root;if(remote==='/root')return path.join(root,'virtual-root');if(remote==='/root/autodl-tmp')return root;if(!remote.startsWith('/root/autodl-tmp/'))throw Error('outside fixture');const target=path.resolve(root,remote.slice('/root/autodl-tmp/'.length));if(!target.startsWith(root+path.sep))throw Error('outside fixture');return target;};
    const attrs=(file:string)=>{const stat=fs.lstatSync(file);return {mode:stat.mode,size:file.endsWith('figure.txt')?options.reportedOutputSize??stat.size:stat.size,uid:0,gid:0,atime:Math.floor(stat.atimeMs/1000),mtime:Math.floor(stat.mtimeMs/1000)};};
    const attempt=(id:number,run:()=>void)=>{try{run()}catch(error){sftp.status(id,(error as NodeJS.ErrnoException).code==='ENOENT'?code.NO_SUCH_FILE:code.FAILURE)}};
    sftp.on('LSTAT',(id,name)=>attempt(id,()=>sftp.attrs(id,attrs(local(name)))));sftp.on('STAT',(id,name)=>attempt(id,()=>sftp.attrs(id,attrs(local(name)))));
    sftp.on('MKDIR',(id,name)=>attempt(id,()=>{fs.mkdirSync(local(name),{recursive:true});sftp.status(id,code.OK)}));
    sftp.on('OPEN',(id,name,flags)=>attempt(id,()=>{const fd=fs.openSync(local(name),(flags&2)?'w':'r');const handle=String(++next);handles.set(handle,{fd});sftp.handle(id,Buffer.from(handle))}));
    sftp.on('FSTAT',(id,handle)=>attempt(id,()=>{const fd=handles.get(handle.toString())!.fd!,stat=fs.fstatSync(fd);sftp.attrs(id,{mode:stat.mode,size:stat.size,uid:0,gid:0,atime:0,mtime:0})}));
    sftp.on('READ',(id,handle,offset,length)=>attempt(id,()=>{const data=Buffer.alloc(length),bytes=fs.readSync(handles.get(handle.toString())!.fd!,data,0,length,offset);if(!bytes)sftp.status(id,code.EOF);else sftp.data(id,data.subarray(0,bytes))}));
    sftp.on('WRITE',(id,handle,offset,data)=>attempt(id,()=>{fs.writeSync(handles.get(handle.toString())!.fd!,data,0,data.length,offset);sftp.status(id,code.OK)}));
    sftp.on('CLOSE',(id,handle)=>attempt(id,()=>{const row=handles.get(handle.toString())!;if(row.fd!==undefined)fs.closeSync(row.fd);handles.delete(handle.toString());sftp.status(id,code.OK)}));
    sftp.on('REALPATH',(id,name)=>attempt(id,()=>{local(name);sftp.name(id,[{filename:name,longname:name,attrs:{}}])}));
    sftp.on('OPENDIR',(id,name)=>attempt(id,()=>{const directory=local(name),handle=String(++next);handles.set(handle,{entries:fs.readdirSync(directory),directory});sftp.handle(id,Buffer.from(handle))}));
    sftp.on('READDIR',(id,handle)=>attempt(id,()=>{const row=handles.get(handle.toString())!;if(!row.entries?.length){sftp.status(id,code.EOF);return;}sftp.name(id,row.entries.splice(0).map(filename=>({filename,longname:filename,attrs:attrs(path.join(row.directory!,filename))})))}));
   });
  }));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {port:(server.address() as AddressInfo).port,commands,close:async()=>{for(const client of clients)client.end();await new Promise<void>(resolve=>server.close(()=>resolve()))}};
}
