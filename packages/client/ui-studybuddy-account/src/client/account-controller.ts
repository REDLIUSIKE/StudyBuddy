/** One balance authority for the header, account page and completed recharge orders. */
import type {AiAccountSummary,CloudAccountApi,OwnedScope,CanonicalMoney} from '@studybuddy/contracts'
import {ObservableState,sameScope,errorCode} from './observable.ts'
export interface AccountSnapshot {readonly scope:OwnedScope|null;readonly summary:AiAccountSummary|null;readonly status:'idle'|'loading'|'ready'|'error';readonly stale:boolean;readonly errorCode:string|null}
export function moneyText(value:CanonicalMoney|undefined|null):string{return value==null?'—':'¥'+value}
export class StudyBuddyAccountController extends ObservableState<AccountSnapshot>{
  #revision=0
  #pending:Promise<void>|null=null
  constructor(private readonly api:Pick<CloudAccountApi,'getAiAccountSummary'>){super({scope:null,summary:null,status:'idle',stale:false,errorCode:null})}
  setScope(scope:OwnedScope|null):void{
    if(sameScope(scope,this.snapshot.scope))return
    ++this.#revision;this.#pending=null;this.publish({scope,summary:null,status:'idle',stale:false,errorCode:null})
  }
  /** Join the current scope's authoritative read; automatic refreshes cannot supersede it. */
  refreshSummary=():Promise<void>=>{
    if(this.snapshot.scope===null)return Promise.resolve()
    if(this.#pending)return this.#pending
    const revision=++this.#revision
    this.publish({...this.snapshot,status:'loading',errorCode:null})
    const pending=this.readSummary(revision)
    this.#pending=pending
    void pending.finally(()=>{if(this.#pending===pending)this.#pending=null})
    return pending
  }
  private async readSummary(revision:number):Promise<void>{
    try{
      const summary=await this.api.getAiAccountSummary()
      if(revision===this.#revision)this.publish({...this.snapshot,summary,status:'ready',stale:false})
    }catch(error){if(revision===this.#revision)this.publish({...this.snapshot,status:'error',stale:this.snapshot.summary!==null,errorCode:errorCode(error)})}
  }
  override dispose():void{this.setScope(null);super.dispose()}
}
