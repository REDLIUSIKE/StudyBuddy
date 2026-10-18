/** React-free stable snapshots, shared by every registration owned by this plugin. */
import type {OwnedScope} from '@studybuddy/contracts'
export const sameScope=(a:OwnedScope|null,b:OwnedScope|null):boolean=>a===b||a!==null&&b!==null&&a.accountId===b.accountId&&a.generation===b.generation
export const errorCode=(error:unknown):string=>error instanceof Error&&/^[A-Z0-9_]{1,128}$/u.test(error.message)?error.message:'BUSINESS_REQUEST_FAILED'
export class ObservableState<T> {
  #listeners=new Set<()=>void>()
  constructor(protected snapshot:T){}
  getSnapshot=():T=>this.snapshot
  subscribe=(listener:()=>void):(()=>void)=>{this.#listeners.add(listener);return()=>{this.#listeners.delete(listener)}}
  protected publish(snapshot:T):void{this.snapshot=snapshot;for(const listener of this.#listeners)listener()}
  dispose():void{this.#listeners.clear()}
}
