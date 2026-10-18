import type {ChatConversationViewNode,ToolChatData} from '../contract/chat-nodes.ts'

/** Only settled image results owned by this conversation can turn a request ID into media. */
export function generatedImageRequests(nodes:readonly ChatConversationViewNode[],sessionId:string):ReadonlySet<string>{
 const requests=new Set<string>()
 for(const node of nodes){
  if(node.kind!=='tool-call')continue
  const root=(node.data as ToolChatData).root
  if(!('kind' in root)||root.kind!=='tool-result'||root.isError||!['generate_image','generation_status'].includes(root.name))continue
  const metadata=root.meta
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))continue
  const task=metadata as Record<string,unknown>
  if(task.schemaVersion===1&&task.sessionId===sessionId&&task.kind==='image'&&task.state==='completed'&&task.contentAvailable===true&&
   typeof task.requestId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(task.requestId))requests.add(task.requestId)
 }
 return requests
}

/** Reuse the authenticated media route; unregistered destinations stay ordinary file references. */
export function generatedImageUrl(base:string,sessionId:string,path:string,requests:ReadonlySet<string>):string|undefined{
 if(!requests.has(path))return undefined
 let url:URL
 try{url=new URL('api/studybuddy-media',base)}catch{return undefined}
 if(!['http:','https:'].includes(url.protocol)&&!(url.protocol==='dsh-app:'&&url.hostname==='app'))return undefined
 url.search=new URLSearchParams({sessionId,requestId:path,kind:'image',mode:'content'}).toString()
 return url.href
}
