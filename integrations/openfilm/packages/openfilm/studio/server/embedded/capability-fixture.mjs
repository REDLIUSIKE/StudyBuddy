import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createEmbeddedVideoDomain} from './domain.mjs';
import {filmHtml} from '../../../src/film-doc.mjs';
export const scope={accountGeneration:'account-a',workspaceId:'workspace-a',projectId:'film-a',sessionId:'editor-root'};
export const caller={schemaVersion:1,grantRef:'11111111-1111-4111-8111-111111111111',sessionId:'ordinary-session',toolCallId:'call-a'};
export const initial=filmHtml({stage:{w:160,h:90},tracks:[{clips:[{src:'title.html',id:'title'}]}]});
export async function fixture(t,request=async()=>{throw Error('No paid test service');},renderRuntime){
 const directory=await mkdtemp(join(tmpdir(),'sb-cap-video-')),root=join(directory,'汽车 项目'),stateRoot=join(directory,'state'),ui=join(directory,'ui');
 await mkdir(root);await mkdir(ui);await writeFile(join(root,'film.html'),initial);await writeFile(join(root,'title.html'),'<p>汽车</p>');await writeFile(join(ui,'index.html'),'Studio');
 const domain=await createEmbeddedVideoDomain({accountGeneration:scope.accountGeneration,workspaceRoot:directory,stateRoot,staticDirectory:ui,guestAuthorization:'test-private',...(renderRuntime?{renderRuntime}:{}),isCurrentScope:value=>JSON.stringify(value)===JSON.stringify(scope),resolveProject:async()=>root,scopeForRoot:()=>scope,capabilities:{request}});
 t.after(async()=>{await domain.close();await rm(directory,{recursive:true,force:true});});return{domain,root,directory};
}
