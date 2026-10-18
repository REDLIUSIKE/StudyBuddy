import { posix } from 'node:path'
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const fail=():never=>{throw Error('VIDEO_REFERENCE_INVALID')}
export function videoRelativePath(value:unknown):string{
 if(typeof value!=='string'||!value||value.length>4096||/[\x00-\x1f:\\?]/.test(value)||value.startsWith('/'))return fail()
 const normalized=posix.normalize(value)
 if(normalized==='.'||normalized==='..'||normalized.startsWith('../'))return fail()
 return normalized
}
function clipSource(value:unknown):string|null{
 if(typeof value!=='string')return fail()
 if(/^https?:\/\//i.test(value))return null
 try{return videoRelativePath(decodeURIComponent(value.split(/[?#]/,1)[0]!))}catch{return fail()}
}
/** Store semantic reference fields and local source paths; preview URLs never enter model context. */
export function sanitizeVideoReference(value:unknown):{text:string;files:string[];data:Record<string,unknown>}{
 if(!record(value)||!['clip','layer','region','time','range','track','file','subtitle'].includes(String(value.kind)))return fail()
 const data:Record<string,unknown>={kind:value.kind},files:string[]=[]
 for(const key of['id','loc','label','clipKind','clipId','text','tag','lang','fileKind']){
  if(value[key]===null){data[key]=null;continue}
  if(value[key]!==undefined){if(typeof value[key]!=='string'||(value[key] as string).length>16384)return fail();data[key]=value[key]}
 }
 for(const key of['time','start','end','track','in','speed','duration','w','h','index']){
  if(value[key]!==undefined){if(typeof value[key]!=='number'||!Number.isFinite(value[key])||(value[key] as number)<0)return fail();data[key]=value[key]}
 }
 for(const key of['clipIds','texts'])if(value[key]!==undefined){const list=value[key];if(!Array.isArray(list)||list.length>512||list.some(item=>typeof item!=='string'||item.length>4096))return fail();data[key]=list}
 if(value.box!==undefined){if(!record(value.box)||Object.keys(value.box).some(key=>!['x','y','w','h'].includes(key))||['x','y','w','h'].some(key=>typeof value.box![key as never]!=='number'||!Number.isFinite(Reflect.get(value.box as object,key))))return fail();data.box=value.box}
 if(value.kind==='file'){data.path=videoRelativePath(value.path);files.push(data.path as string)}
 if(value.kind==='clip'&&value.src){const file=clipSource(value.src);if(file){data.src=file;files.push(file)}else data.sourceKind='remote'}
 if(value.kind==='layer'&&value.source){if(typeof value.source!=='string')return fail();const file=videoRelativePath(value.source.replace(/:\d+(?::\d+)?$/,''));data.source=value.source;files.push(file)}
 if(value.kind==='time'&&data.time===undefined)return fail()
 if(['range','subtitle','clip'].includes(String(value.kind))&&(data.start===undefined||data.end===undefined||Number(data.end)<Number(data.start)))return fail()
 if(value.words!==undefined){if(!Array.isArray(value.words)||value.words.length>2048)return fail();data.words=value.words.map(word=>{if(!record(word)||typeof word.text!=='string'||word.text.length>4096||typeof word.start!=='number'||typeof word.end!=='number'||!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.start<0||word.end<word.start)return fail();return{text:word.text,start:word.start,end:word.end}})}
 return{text:JSON.stringify(data,null,2),files:[...new Set(files)],data}
}
