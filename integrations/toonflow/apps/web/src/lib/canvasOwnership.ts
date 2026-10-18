import {ref} from 'vue';
const native=import.meta.env.VITE_STUDYBUDDY_NATIVE_AIGC==='1';
const background=new URLSearchParams(location.search).get('capabilityController');
export const canvasControllerRef=background&&/^[a-f0-9-]{36}$/.test(background)?background:crypto.randomUUID();
export const preparedCanvasDirectory=ref('');
/** Obtain the original controller handoff before a second page can load writable canvas state. */
export async function prepareCanvasOwnership(directory:string){
 if(!native||preparedCanvasDirectory.value===directory)return;
 if(!background){
  const host=Reflect.get(window,'aigcHost') as {request(input:unknown):Promise<unknown>}|undefined;
  if(!host)throw Error('AIGC_NATIVE_BRIDGE_UNAVAILABLE');
  await host.request({kind:'prepare-canvas',directory,controllerRef:canvasControllerRef});
 }
 preparedCanvasDirectory.value=directory;
}
