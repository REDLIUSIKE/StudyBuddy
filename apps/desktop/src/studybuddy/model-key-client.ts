import { parseModelKeyInvocationV1 } from '@studybuddy/contracts'
import type { StudyBuddyFetch } from './services.ts'

const paths = {
  openai_chat_completions: '/v1/chat/completions', openai_responses: '/v1/responses',
  anthropic_messages: '/v1/messages', 'openai_image.generate': '/v1/images/generations',
  'openai_video.create': '/v1/videos',
  'minimax_speech.generate':'/minimax/v1/t2a_v2', 'minimax_speech.transcribe':'/minimax/v1/speech_to_text',
  'volcengine_audio.generate':'/volcengine/v1/audio/generations',
} as const
export interface ModelKeyPriceGuard {version:string;expressionSha256:string;pluginSha256:string}

/** Private HTTP transport authenticated only by the configured service Key.
 * Caller accounts, login cookies and connection grants never enter a request. */
export class ModelKeyClient {
  private readonly baseUrl: string
  constructor(private readonly options: {
    baseUrl: string
    readKey(): Promise<string>
    fetch: StudyBuddyFetch
  }) {
    const url = new URL(options.baseUrl)
    if (url.username || url.password || url.search || url.hash ||
      url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      throw new Error('MODEL_KEY_TARGET_INVALID')
    this.baseUrl = url.origin + url.pathname.replace(/\/$/, '').replace(/\/v1$/, '')
  }
  private async request(path: string, body?: unknown, signal?: AbortSignal, range?: string): Promise<Response> {
    const key = await this.options.readKey()
    if (!key || key.length > 4096 || /[\s\p{Cc}]/u.test(key)) throw new Error('MODEL_KEY_INVALID')
    return this.options.fetch(this.baseUrl + path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'omit', redirect: 'error',
      headers: { Authorization: 'Bearer ' + key, Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(range ? { Range: range } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal === undefined ? {} : { signal }),
    })
  }
  async invoke(input: unknown, body: Record<string, unknown>, signal?: AbortSignal, guard?: ModelKeyPriceGuard): Promise<Response> {
    const request = parseModelKeyInvocationV1(input)
    if (body.model !== request.exactModelId) throw new Error('MODEL_KEY_EXACT_MODEL_MISMATCH')
    if (guard && (Object.keys(guard).sort().join(',') !== 'expressionSha256,pluginSha256,version' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(guard.version) || !/^[a-f0-9]{64}$/.test(guard.expressionSha256) ||
      !/^[a-f0-9]{64}$/.test(guard.pluginSha256))) throw Error('MODEL_KEY_PRICE_GUARD_INVALID')
    const key = await this.options.readKey()
    if (!key || key.length > 4096 || /[\s\p{Cc}]/u.test(key)) throw new Error('MODEL_KEY_INVALID')
    return this.options.fetch(this.baseUrl + paths[request.protocol], {
      method: 'POST', credentials: 'omit', redirect: 'error',
      headers: { Authorization: 'Bearer ' + key, Accept: 'application/json', 'Content-Type': 'application/json',
        'X-Request-Id': request.requestId, ...guard ? {'X-StudyBuddy-CNY-Price-Version': guard.version,
          'X-StudyBuddy-CNY-Expression-SHA256': guard.expressionSha256,'X-StudyBuddy-CNY-Plugin-SHA256': guard.pluginSha256} : {} },
      body: JSON.stringify(body), ...(signal === undefined ? {} : { signal }),
    })
  }
  models(signal?: AbortSignal): Promise<Response> { return this.request('/v1/models', undefined, signal) }
  catalog(signal?:AbortSignal):Promise<Response>{return this.request('/v1/model-catalog',undefined,signal)}
  speechCatalog(signal?:AbortSignal):Promise<Response>{return this.request('/minimax/v1/speech/catalog',undefined,signal)}
  async invokeMultipart(input:unknown,body:FormData,signal?:AbortSignal,guard?:ModelKeyPriceGuard):Promise<Response>{
    const request=parseModelKeyInvocationV1(input)
    if(request.protocol!=='minimax_speech.transcribe'||request.purpose!=='transcription'||
       body.getAll('model').length!==1||body.get('model')!==request.exactModelId||body.getAll('file').length!==1)
      throw Error('MODEL_KEY_EXACT_MODEL_MISMATCH')
    for(const [key,value]of body){
      if(!['model','file','response_format','stream','timestamp_level'].includes(key)||body.getAll(key).length!==1||
        key==='response_format'&&!['json','verbose_json'].includes(String(value))||key==='stream'&&value!=='false'||key==='timestamp_level'&&value!=='word')throw Error('MODEL_KEY_MULTIPART_INVALID')
    }
    if(body.get('response_format')==='verbose_json'&&body.get('timestamp_level')!=='word'||body.has('timestamp_level')&&body.get('response_format')!=='verbose_json')throw Error('MODEL_KEY_MULTIPART_INVALID')
    const file=body.get('file')
    if(!(file instanceof Blob)||!file.size||file.size>50_000_000)throw Error('MODEL_KEY_MULTIPART_INVALID')
    if(!guard||Object.keys(guard).sort().join(',')!=='expressionSha256,pluginSha256,version'||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(guard.version)||!/^[a-f0-9]{64}$/.test(guard.expressionSha256)||
      !/^[a-f0-9]{64}$/.test(guard.pluginSha256))throw Error('MODEL_KEY_PRICE_GUARD_INVALID')
    const key=await this.options.readKey()
    if(!key||key.length>4096||/[\s\p{Cc}]/u.test(key))throw Error('MODEL_KEY_INVALID')
    return this.options.fetch(this.baseUrl+paths[request.protocol],{
      method:'POST',credentials:'omit',redirect:'error',body,...signal===undefined?{}:{signal},
      headers:{Authorization:'Bearer '+key,Accept:'application/json','X-Request-Id':request.requestId,
        'X-StudyBuddy-CNY-Price-Version':guard.version,'X-StudyBuddy-CNY-Expression-SHA256':guard.expressionSha256,
        'X-StudyBuddy-CNY-Plugin-SHA256':guard.pluginSha256}
    })
  }
  requestStatus(id: string, signal?: AbortSignal): Promise<Response> {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw Error('MODEL_KEY_REQUEST_INVALID')
    return this.request('/v1/requests/' + id, undefined, signal)
  }
  mediaRequestStatus(id:string, signal?:AbortSignal):Promise<Response>{
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw Error('MODEL_KEY_REQUEST_INVALID')
    return this.request('/v1/tasks/by-request/'+id,undefined,signal)
  }
  async task(taskId: string, operation: 'status' | 'content', options?: { signal?: AbortSignal; range?: string }): Promise<Response> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(taskId) || !['status', 'content'].includes(operation) ||
      options?.range !== undefined && !/^bytes=\d+-\d*$/.test(options.range)) throw new Error('MODEL_KEY_TASK_INVALID')
    return this.request('/v1/videos/' + taskId + (operation === 'content' ? '/content' : ''), undefined, options?.signal, options?.range)
  }
}
