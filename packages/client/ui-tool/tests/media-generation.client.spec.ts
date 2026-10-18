import {expect,it} from 'vitest';
const module=await import('../src/client/tool/models/'+'media-generation-model.ts').catch(()=>({mediaTaskModel:()=>null,mediaTaskUrl:()=>''}));
const task={schemaVersion:1,requestId:'44444444-4444-4444-8444-444444444444',sessionId:'session-a',kind:'image',modelId:'doubao-seedream-5-0-flash-260915',state:'completed',contentAvailable:true};
it('derives a keyless historical result and only builds the owned media endpoint',()=>{
 expect(module.mediaTaskModel(task)).toEqual(task);const url=module.mediaTaskUrl(task,'content');expect(url).toContain('/api/studybuddy-media?');expect(url).toContain('requestId='+task.requestId);expect(url).not.toContain('Bearer');
});
it('refuses forged model, owner path and artifact references',()=>{
 for(const extra of [{requestId:'../../foreign'},{sessionId:'../../foreign'},{modelId:'unreviewed'},{kind:'video'},{contentAvailable:'true'}])
 expect(module.mediaTaskModel({...task,...extra})).toBeNull();
});
