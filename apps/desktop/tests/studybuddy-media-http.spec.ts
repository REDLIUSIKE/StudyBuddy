import {expect,it,vi} from 'vitest';
import {AigcMediaClient} from '../src/studybuddy/aigc-media.ts';
const scope={accountId:'owned',generation:2};
const journal={get:async()=>null,claim:async(_owner:string,row:any)=>({row,created:true}),save:async()=>{}};
it('uses the configured Key for the original image catalog and legacy content',async()=>{
 const fetch=vi.fn(async(url:string)=>url.endsWith('/content')?new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{'content-type':'image/png'}}):Response.json({schemaVersion:1}));
 const client=new AigcMediaClient({isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'private-fixture'}),journal,fetch});
 expect(await client.request(scope,'/images/catalog')).toEqual({schemaVersion:1});
 expect((await client.content(scope,'/images/requests/44444444-4444-4444-8444-444444444444/content')).headers.get('content-type')).toBe('image/png');
 expect(fetch.mock.calls.every(c=>c[0].startsWith('https://guijitongzhuo.com/api/v2/aigc-media/key/'))).toBe(true);
});
it('rejects external endpoint paths and an HTML image reply',async()=>{
 const client=new AigcMediaClient({isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'private-fixture'}),journal,fetch:async()=>new Response('html',{headers:{'content-type':'text/html'}})});
 await expect(client.request(scope,'https://foreign.test')).rejects.toThrow('AIGC_ENDPOINT_DENIED');
 await expect(client.content(scope,'/images/requests/44444444-4444-4444-8444-444444444444/content')).rejects.toThrow('AIGC_TASK_CONTENT_UNAVAILABLE');
});
