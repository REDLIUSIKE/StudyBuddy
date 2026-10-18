/** One ephemeral browser lease per login; late acquisitions are always released. */
import type {EmbeddedLease,EmbeddedTheme,OwnedScope} from '@studybuddy/contracts'
import type {AccountHost} from './business-api.ts'
import {ObservableState,sameScope,errorCode} from './observable.ts'
export interface ProfileSnapshot {scope:OwnedScope|null;lease:EmbeddedLease|null;busy:boolean;errorCode:string|null}
export class ProfileController extends ObservableState<ProfileSnapshot>{
  #epoch=0
  #acquiring=false
  #stopInvalid:(()=>void)|undefined
  constructor(private readonly api:NonNullable<AccountHost['embedded']>|undefined,private readonly target:'personal_profile'|'model_insights'='personal_profile'){super({scope:null,lease:null,busy:false,errorCode:null});this.#stopInvalid=api?.subscribeInvalid?.(lease=>{if(this.snapshot.lease?.lease===lease)this.publish({...this.snapshot,lease:null,busy:false,errorCode:'AUTH_REQUIRED'})})}
  setScope(scope:OwnedScope|null):void{
    if(sameScope(scope,this.snapshot.scope))return
    ++this.#epoch;this.#acquiring=false
    const old=this.snapshot.lease
    this.publish({scope,lease:null,busy:false,errorCode:null})
    if(old)void this.api?.release(old.lease).catch(()=>{})
  }
  acquire=async():Promise<void>=>{
    if(!this.snapshot.scope||this.snapshot.lease||this.#acquiring)return
    const epoch=this.#epoch,scope=this.snapshot.scope;this.#acquiring=true
    this.publish({...this.snapshot,busy:true,errorCode:null})
    try{
      if(!this.api)throw new Error('PROFILE_EMBED_UNAVAILABLE')
      const lease=await this.api.acquire(this.target)
      if(epoch!==this.#epoch||!sameScope(lease.scope,scope)){await this.api.release(lease.lease);return}
      this.publish({...this.snapshot,lease})
    }catch(error){if(epoch===this.#epoch)this.publish({...this.snapshot,errorCode:errorCode(error)})}
    finally{if(epoch===this.#epoch){this.#acquiring=false;this.publish({...this.snapshot,busy:false})}}
  }
  setTheme=async(theme:EmbeddedTheme):Promise<void>=>{
    const lease=this.snapshot.lease,epoch=this.#epoch;if(!lease||!this.api)return
    try{await this.api.setTheme(lease.lease,theme)}catch(error){if(epoch===this.#epoch)this.publish({...this.snapshot,errorCode:errorCode(error)})}
  }
  reportFailure=(code:string):void=>{this.publish({...this.snapshot,errorCode:code,busy:false})}
  retry=async():Promise<void>=>{
    const old=this.snapshot.lease,epoch=this.#epoch
    this.publish({...this.snapshot,lease:null,errorCode:null})
    if(old)await this.api?.release(old.lease).catch(()=>{})
    if(epoch===this.#epoch)await this.acquire()
  }
  override dispose():void{this.#stopInvalid?.();this.setScope(null);super.dispose()}
}
