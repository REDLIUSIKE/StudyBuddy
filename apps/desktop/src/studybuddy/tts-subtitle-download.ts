/** Read a supplier subtitle artifact without forwarding any API credential or following redirects. */
import {HttpFetchProvider} from '@deepseek-ai/dsh-web-fetch-http'
const reader=new HttpFetchProvider({maxResponseBytes:2*1024*1024,maxBodyChars:2*1024*1024,timeoutMs:30000,maxRedirects:0,userAgent:'StudyBuddy',allowOctetStreamJson:true})
/** Anonymous JSON download; the native web reader retains public-network/DNS/proxy policy.
 * @param value - Temporary subtitle URL from the authenticated supplier result.
 * @param signal - Current native request cancellation.
 * @param provider - Existing anonymous native fetch implementation; replaceable in keyless tests.
 * @returns Bounded decoded JSON only, without URL or headers.
 */
export async function downloadMiniMaxTtsSubtitles(value:string,signal:AbortSignal,provider:Pick<HttpFetchProvider,'fetch'>=reader):Promise<unknown>{
 try{
  signal.throwIfAborted();if(typeof value!=='string'||value.length>8192)throw Error('invalid subtitle URL')
  const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443')throw Error('invalid subtitle URL')
  const result=await provider.fetch({url:url.href},signal);signal.throwIfAborted()
  if(result.statusCode!==200||result.truncated||result.body.kind!=='text'||Buffer.byteLength(result.body.content)>2*1024*1024)throw Error('invalid subtitle body')
  return JSON.parse(result.body.content)
 }catch{throw Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE')}
}
