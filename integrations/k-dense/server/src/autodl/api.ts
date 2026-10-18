/** Official AutoDL Pro API; GET snapshot/status intentionally carry the documented JSON body. */
import {request} from 'node:https';
export interface AutoDLTransport { (url:string,options:{method:'GET'|'POST';headers:Record<string,string>;body:string;signal:AbortSignal}):Promise<{status:number;body:unknown}> }
export const autoDLTransport:AutoDLTransport=(url,options)=>new Promise((resolve,reject)=>{
 const data=Buffer.from(options.body),call=request(url,{method:options.method,headers:{...options.headers,'Content-Length':String(data.byteLength)},signal:options.signal},response=>{
  const chunks:Buffer[]=[];let bytes=0;response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1048576){response.destroy(Error('AUTODL_RESPONSE_TOO_LARGE'));return;}chunks.push(chunk);});response.once('error',()=>reject(Error('AUTODL_TRANSPORT_FAILED')));response.once('end',()=>{try{resolve({status:response.statusCode??0,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch{reject(Error('AUTODL_RESPONSE_INVALID'));}});
 });call.once('error',()=>reject(Error(options.signal.aborted?'AUTODL_REQUEST_ABORTED':'AUTODL_TRANSPORT_FAILED')));call.end(data);
});
export interface AutoDLInstanceRequest {gpuSpec:string;gpuCount:number;image:string;cudaMin:number;diskGB:number;regions?:string[]}
export interface AutoDLSnapshot {proxy_host:string;ssh_port:number;root_password:string}
export class AutoDLApi {
 constructor(private readonly token:string,private readonly transport:AutoDLTransport=autoDLTransport){}
 private async call(method:'GET'|'POST',operation:string,body:object,signal:AbortSignal):Promise<any>{
  signal.throwIfAborted();const result=await this.transport('https://api.autodl.com/api/v1/dev/instance/pro/'+operation,{method,headers:{Authorization:this.token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])});
  if(result.status<200||result.status>=300)throw Error('AUTODL_HTTP_'+result.status);const value=result.body as {code?:unknown;data?:unknown};if(!value||typeof value!=='object'||value.code!=='Success')throw Error('AUTODL_PROVIDER_REJECTED');return value.data;
 }
 async create(spec:AutoDLInstanceRequest,name:string,signal:AbortSignal):Promise<string>{const data=await this.call('POST','create',{req_gpu_amount:spec.gpuCount,expand_system_disk_by_gb:spec.diskGB,gpu_spec_uuid:spec.gpuSpec,image_uuid:spec.image,cuda_v_from:spec.cudaMin,instance_name:name,...(spec.regions?.length?{data_center_list:spec.regions}:{})},signal);if(typeof data!=='string'||!/^pro-[a-zA-Z0-9-]{1,100}$/.test(data))throw Error('AUTODL_INSTANCE_RESPONSE_INVALID');return data;}
 async status(id:string,signal:AbortSignal):Promise<string>{const value=await this.call('GET','status',{instance_uuid:id},signal);if(typeof value!=='string')throw Error('AUTODL_STATUS_INVALID');return value;}
 async snapshot(id:string,signal:AbortSignal):Promise<AutoDLSnapshot>{const value=await this.call('GET','snapshot',{instance_uuid:id},signal);if(!value||typeof value.proxy_host!=='string'||!/^[a-zA-Z0-9.-]+$/.test(value.proxy_host)||!['.autodl.com','.seetacloud.com'].some(suffix=>value.proxy_host.endsWith(suffix))||!Number.isInteger(value.ssh_port)||value.ssh_port<1||value.ssh_port>65535||typeof value.root_password!=='string'||!value.root_password||value.root_password.length>8192)throw Error('AUTODL_SSH_SNAPSHOT_INVALID');return {proxy_host:value.proxy_host,ssh_port:value.ssh_port,root_password:value.root_password};}
 async powerOff(id:string,signal:AbortSignal):Promise<void>{await this.call('POST','power_off',{instance_uuid:id},signal);}
 async list(page:number,signal:AbortSignal):Promise<{list:{uuid:string;name:string}[];max_page:number}>{const value=await this.call('POST','list',{page_index:page,page_size:100},signal);if(!value||!Array.isArray(value.list)||!Number.isInteger(value.max_page)||value.max_page<0)throw Error('AUTODL_LIST_INVALID');return value;}
}
