import { expect, it, vi } from 'vitest'
import { ModelKeyClient } from '../src/studybuddy/model-key-client.ts'

const invocation = { schemaVersion: 1 as const, requestId: '4c89b2fa-d652-4cbe-8c2f-420e410d87a1',
  exactModelId: 'deepseek-v4-flash', protocol: 'openai_chat_completions' as const, purpose: 'chat' as const }
it('routes sound effects through the native gateway and binds the exact CNY price guard',async()=>{
 const fetch=vi.fn(async(_url:string,_init?:RequestInit)=>Response.json({}));
 const client=new ModelKeyClient({baseUrl:'https://gateway.test',readKey:async()=>'native-gateway-fixture-key',fetch});
 const body={model:'seed-audio-1.0',text_prompt:'rain'};
 await client.invoke({...invocation,exactModelId:body.model,protocol:'volcengine_audio.generate',purpose:'audio'},body,undefined,{version:'audio-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)});
 const [url,init]=fetch.mock.calls[0]!;
 expect(url).toBe('https://gateway.test/volcengine/v1/audio/generations');
 expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer native-gateway-fixture-key');
 expect(new Headers(init?.headers).get('X-StudyBuddy-CNY-Plugin-SHA256')).toBe('b'.repeat(64));
 expect(new Headers(init?.headers).has('X-Api-Key')).toBe(false);
 await expect(client.invoke({...invocation,exactModelId:body.model,protocol:'volcengine_audio.generate',purpose:'chat'},body)).rejects.toThrow('MODEL_KEY_INVOCATION_INVALID');
 expect(fetch).toHaveBeenCalledOnce();
});
it('invokes with only a Key and no StudyBuddy account, login, device or tool grant', async () => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ choices: [] }))
  const client = new ModelKeyClient({ baseUrl: 'https://gateway.test', readKey: async () => 'synthetic-key', fetch })
  await client.invoke(invocation, { model: invocation.exactModelId, messages: [] })
  expect(fetch).toHaveBeenCalledOnce()
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://gateway.test/v1/chat/completions')
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer synthetic-key')
  expect(new Headers(init.headers).get('X-Request-Id')).toBe(invocation.requestId)
  expect(init.credentials).toBe('omit')
  expect(init.redirect).toBe('error')
  for (const header of ['X-StudyBuddy-Request-Ticket', 'X-StudyBuddy-Client-Audience', 'Cookie'])
    expect(new Headers(init.headers).has(header)).toBe(false)
  expect(JSON.parse(String(init.body))).toEqual({ model: invocation.exactModelId, messages: [] })
})
it('reads models and existing task content using the same Key', async () => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('existing content'))
  const client = new ModelKeyClient({ baseUrl: 'https://gateway.test/v1', readKey: async () => 'synthetic-key', fetch })
  await client.models()
  await client.task('task_existing', 'content', { range: 'bytes=0-9' })
  expect(fetch.mock.calls.map(args => args[0])).toEqual(['https://gateway.test/v1/models', 'https://gateway.test/v1/videos/task_existing/content'])
  const init = fetch.mock.calls[1]?.[1] as unknown as RequestInit
  expect(new Headers(init.headers).get('Range')).toBe('bytes=0-9')
})
it('rejects changed routes, authority claims, malformed Keys and mismatched exact models before transport', async () => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({}))
  const client = new ModelKeyClient({ baseUrl: 'https://gateway.test', readKey: async () => 'synthetic-key', fetch })
  await expect(client.invoke({ ...invocation, accountId: 'caller' }, { model: invocation.exactModelId })).rejects.toThrow()
  await expect(client.invoke(invocation, { model: 'different-exact-model' })).rejects.toThrow()
  await expect(client.task('../another-owner', 'content')).rejects.toThrow()
  const malformed = new ModelKeyClient({ baseUrl: 'https://gateway.test', readKey: async () => 'key\r\nCookie: caller', fetch })
  await expect(malformed.models()).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})

it('sends reviewed speech file with Key and exact price guard without serializing audio into JSON',async()=>{
 let sent:RequestInit|undefined
 const client=new ModelKeyClient({baseUrl:'https://gateway.test',readKey:async()=>'synthetic-key',fetch:async(url,init)=>{
  expect(url).toBe('https://gateway.test/minimax/v1/speech_to_text');sent=init;return Response.json({text:'draft',duration:26.325,trace_id:'trace'})
 }})
 const input={schemaVersion:1,requestId:invocation.requestId,exactModelId:'asr-1.0',protocol:'minimax_speech.transcribe',purpose:'transcription'}
 const form=new FormData();form.append('model','asr-1.0');form.append('file',new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'}),'voice.wav')
 await client.invokeMultipart(input,form,undefined,{version:'fixture-1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)})
 expect(sent?.body).toBe(form);expect(sent?.credentials).toBe('omit')
 expect(new Headers(sent?.headers).get('X-Request-Id')).toBe(invocation.requestId)
 expect(new Headers(sent?.headers).has('Content-Type')).toBe(false)
 expect(new Headers(sent?.headers).has('Cookie')).toBe(false)
})
