/** Pinned existing account endpoints. Only the authenticated application main frame may call them. */
import { parseCreateRechargeOrderInput, parseAiUsageQuery, parseAiUsageId } from '@studybuddy/contracts'
import type { BusinessOperationMap } from '@studybuddy/contracts'
import type { StudyBuddyAuth, StudyBuddyFetch } from './services.ts'
import { parseBusinessResult } from './business-contracts.ts'

export function assertBusinessSender(sender:{ownerId:number|undefined;senderId:number;mainFrameId:number|undefined;frameId:number|undefined;url:string;authenticated:boolean}):void{
  if(!sender.authenticated||sender.ownerId!==sender.senderId||sender.mainFrameId!==sender.frameId||!/^dsh-app:\/\/app\//u.test(sender.url))throw new Error('BUSINESS_SENDER_DENIED')
}
const orderId=(value:unknown):string=>{if(typeof value!=='string'||!/^sbrc_[A-Za-z0-9_-]{43}$/u.test(value))throw new Error('BUSINESS_ARGS_INVALID');return value}
const page=(value:unknown):number=>{if(value===undefined)return 1;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)throw new Error('BUSINESS_ARGS_INVALID');return value}
/** Convert a closed operation to its original endpoint and request fields. */
export function cloudRequest(method:string,args:readonly unknown[]):{path:string;body?:unknown}{
  switch(method){
    case 'getAiAccountSummary':if(args.length)break;return{path:'/ai-account/summary'}
    case 'listAiUsage':{if(args.length>2)break;const query=parseAiUsageQuery({page:String(page(args[0])),pageSize:String(args[1]??20)});return{path:'/ai-account/usage?'+new URLSearchParams({page:String(query.page),pageSize:String(query.pageSize)})}}
    case 'getAiUsageDetail':if(args.length!==1)break;return{path:'/ai-account/usage/'+encodeURIComponent(parseAiUsageId(args[0]))}
    case 'listRechargeTiers':if(args.length)break;return{path:'/recharge/tiers/v2'}
    case 'listRechargeCoupons':if(args.length>1)break;return{path:'/recharge/coupons?page='+page(args[0])+'&pageSize=20'}
    case 'getReferralSummary':if(args.length)break;return{path:'/referrals/summary'}
    case 'listReferralRecords':if(args.length>1)break;return{path:'/referrals/records?page='+page(args[0])+'&pageSize=20'}
    case 'createRechargeOrder':if(args.length!==3)break;return{path:'/recharge/orders',body:parseCreateRechargeOrderInput({tierCode:args[0],couponIds:args[1],idempotencyKey:args[2]})}
    case 'getActiveRechargeOrder':if(args.length)break;return{path:'/recharge/orders/active'}
    case 'getRechargeOrder':if(args.length!==1)break;return{path:'/recharge/orders/'+orderId(args[0])}
    case 'cancelRechargeOrder':if(args.length!==1)break;return{path:'/recharge/orders/'+orderId(args[0])+'/cancel',body:{}}
    default:throw new Error('BUSINESS_OPERATION_DENIED')
  }
  throw new Error('BUSINESS_ARGS_INVALID')
}
export class BusinessFailure extends Error {
  readonly requestId:string|undefined
  readonly availableAt:string|undefined
  constructor(readonly code:string,readonly status?:number,readonly operationId?:string,details?:{message?:string;requestId?:string;availableAt?:string}){
    super(details?.message??code)
    this.requestId=details?.requestId;this.availableAt=details?.availableAt
  }
}
/** One private HTTP owner, with original parsers and no credential returned to the renderer. */
export class StudyBuddyCloudClient {
  constructor(private readonly auth:StudyBuddyAuth,private readonly fetcher:StudyBuddyFetch){}
  invoke<K extends keyof BusinessOperationMap>(method:K,args:BusinessOperationMap[K]['args']):Promise<BusinessOperationMap[K]['result']>{
    const request=cloudRequest(method,args)
    return this.auth.withSession(async session=>{
      let response:Response
      try{response=await this.fetcher('https://guijitongzhuo.com/api/v1'+request.path,{method:request.body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{Accept:'application/json',Authorization:'Bearer '+session.accessToken,...(request.body===undefined?{}:{'Content-Type':'application/json'})},...(request.body===undefined?{}:{body:JSON.stringify(request.body)})})}
      catch{throw new BusinessFailure('NETWORK_UNAVAILABLE')}
      const value:unknown=await response.json()
      if(!response.ok){
        const code=typeof value==='object'&&value!==null&&'code'in value&&typeof value.code==='string'&&/^[A-Z0-9_]{1,128}$/u.test(value.code)?value.code:response.status===401?'AUTH_REQUIRED':'BUSINESS_REQUEST_FAILED'
        throw new BusinessFailure(code,response.status)
      }
      return parseBusinessResult(method,value)
    })
  }
}
