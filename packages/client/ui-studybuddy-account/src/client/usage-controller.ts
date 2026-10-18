/** Usage remains bound to the original account, device and exact connection grant. */
import type {AiUsagePage,AiUsageDetail,CloudAccountApi,NativeAccountApi,NativeConnectionUiView,NativeToolUsagePageV2,NativeToolUsagePageV3,NativeToolId,OwnedScope} from '@studybuddy/contracts'
import {ObservableState,sameScope,errorCode} from './observable.ts'
type UsagePage=NativeToolUsagePageV2|NativeToolUsagePageV3
type UsageApi=Pick<CloudAccountApi,'listAiUsage'|'getAiUsageDetail'>&Pick<NativeAccountApi,'listNativeConnectionUi'|'getNativeToolUserApiUsage'>
export interface UsageSnapshot {scope:OwnedScope|null;platform:AiUsagePage|null;detail:AiUsageDetail|null;own:readonly UsagePage[];busy:boolean;errorCode:string|null;stale:boolean}
const initial=(scope:OwnedScope|null):UsageSnapshot=>({scope,platform:null,detail:null,own:[],busy:false,errorCode:null,stale:false})
const recorded=(row:NativeConnectionUiView):boolean=>row.state==='connected'&&(row.schemaVersion===3?row.grantRevision!==null:row.fundingSource==='user_api')
/** Validates attribution after the carrier has validated the original wire DTO. */
export function assertNativeUsageMatches(owner:string,connection:NativeConnectionUiView,page:UsagePage):void{
  let invalid=page.accountOwner!==owner||page.toolId!==connection.toolId||page.protocol!==connection.protocol
  if(connection.schemaVersion===3){
    invalid ||= page.schemaVersion!==3||connection.grantRevision!==page.binding.grantRevision||page.records.some(row=>!connection.allowedModelIds.includes(row.modelId))
  }else{
    const authority=connection.authority
    invalid ||= page.schemaVersion!==2||page.records.some(row=>row.modelId!==connection.appliedExactModelId)
    if(page.schemaVersion===2&&authority!==null)invalid ||= authority.accountOwner!==owner||page.deviceId!==authority.deviceId||page.binding.authorityHandle!==authority.authorityHandle||page.binding.bindingRevision!==authority.bindingRevision||page.binding.credentialRevision!==authority.credentialRevision||page.binding.policyRevision!==authority.policyRevision
  }
  if(invalid)throw new Error('NATIVE_USAGE_BINDING_CHANGED')
}
export class UsageController extends ObservableState<UsageSnapshot>{
  #epoch=0
  #request=0
  constructor(private readonly api:UsageApi){super(initial(null))}
  setScope(scope:OwnedScope|null):void{if(sameScope(scope,this.snapshot.scope))return;++this.#epoch;++this.#request;this.publish(initial(scope))}
  async loadPlatform(page=1,pageSize=20):Promise<void>{
    await this.run(async()=>({platform:await this.api.listAiUsage(page,pageSize),detail:null}))
  }
  async loadPlatformDetail(id:string):Promise<void>{await this.run(async()=>({detail:await this.api.getAiUsageDetail(id)}))}
  closeDetail=():void=>{this.publish({...this.snapshot,detail:null})}
  async loadOwn():Promise<void>{
    const scope=this.snapshot.scope;if(!scope)return
    await this.run(async()=>{
      const connections=await this.api.listNativeConnectionUi()
      const own=await Promise.all(connections.filter(recorded).map(async connection=>{
        const page=await this.api.getNativeToolUserApiUsage(connection.toolId,{createdAt:0,requestId:''},100)
        assertNativeUsageMatches(scope.accountId,connection,page);return page
      }))
      return {own}
    })
  }
  async nextOwn(toolId:NativeToolId):Promise<void>{
    const scope=this.snapshot.scope,previous=this.snapshot.own.find(row=>row.toolId===toolId)
    if(!scope||!previous?.nextCursor||this.snapshot.busy)return
    await this.run(async()=>{
      const connection=(await this.api.listNativeConnectionUi()).find(row=>row.toolId===toolId&&recorded(row))
      if(!connection)throw new Error('NATIVE_USAGE_BINDING_CHANGED')
      const next=await this.api.getNativeToolUserApiUsage(toolId,previous.nextCursor!,100)
      assertNativeUsageMatches(scope.accountId,connection,next)
      if(previous.schemaVersion!==next.schemaVersion||JSON.stringify(previous.binding)!==JSON.stringify(next.binding)||next.records.some(row=>previous.records.some(old=>old.requestId===row.requestId)))throw new Error('NATIVE_USAGE_BINDING_CHANGED')
      const merged={...next,records:[...previous.records,...next.records]} as UsagePage
      return {own:this.snapshot.own.map(row=>row.toolId===toolId?merged:row)}
    })
  }
  private async run(read:()=>Promise<Partial<UsageSnapshot>>):Promise<void>{
    if(!this.snapshot.scope)return
    const epoch=this.#epoch,request=++this.#request;this.publish({...this.snapshot,busy:true,errorCode:null})
    try{const result=await read();if(epoch===this.#epoch&&request===this.#request)this.publish({...this.snapshot,...result,stale:false})}
    catch(error){if(epoch===this.#epoch&&request===this.#request)this.publish({...this.snapshot,errorCode:errorCode(error),stale:this.snapshot.platform!==null||this.snapshot.own.length>0})}
    finally{if(epoch===this.#epoch&&request===this.#request)this.publish({...this.snapshot,busy:false})}
  }
  override dispose():void{this.setScope(null);super.dispose()}
}
