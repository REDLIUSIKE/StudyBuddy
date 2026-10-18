import {expect,it} from 'vitest'
import type {SessionEvent} from '@deepseek-ai/dsh-session'
import {replyWorkflowFromEvents} from '../src/research-workflow-control.ts'
function events(text:string,calls=1):SessionEvent[]{return [{seq:0,time:1,type:'assistant/message',data:{turn:0,step:0,message:{role:'assistant',content:[{type:'text',text},...Array.from({length:calls},(_,index)=>({type:'tool-call',id:'call-'+index,name:'research_workflow',arguments:JSON.stringify({action:'run',workflow:true})}))]}}} as unknown as SessionEvent]}
it('reads the exact single original workflow fence from the native reply with the actual tool call',()=>{
 const source='const result = await runs.run("one", {agent:"worker",task:"read"});\nreturn result;';expect(replyWorkflowFromEvents(events('Text\n```js workflow\n'+source+'\n```'),'call-0')).toBe(source);
});
it('rejects unknown calls, ambiguous workflow calls/fences and unfinished source without running source text',()=>{
 expect(()=>replyWorkflowFromEvents(events('```js workflow\nreturn 1;\n```'),'foreign')).toThrow('REPLY_REQUIRED');
 expect(()=>replyWorkflowFromEvents(events('```js workflow\nreturn 1;\n```',2),'call-0')).toThrow('INPUT_INVALID');
 expect(()=>replyWorkflowFromEvents(events('```js workflow\nreturn 1;\n```\n```js workflow\nreturn 2;\n```'),'call-0')).toThrow('INPUT_INVALID');
 expect(()=>replyWorkflowFromEvents(events('```js workflow\nreturn 1;'),'call-0')).toThrow('INPUT_INVALID');
});
