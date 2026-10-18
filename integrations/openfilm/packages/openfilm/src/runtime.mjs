import { AsyncLocalStorage } from 'node:async_hooks';
const runtimes = new AsyncLocalStorage();
export function withRenderRuntime(runtime, callback, required = true, signal, track) {
  return runtimes.run({runtime,required,signal,track},callback);
}
export const currentRenderRuntime = () => runtimes.getStore()?.runtime;
export const currentRenderSignal = () => runtimes.getStore()?.signal;
/** Capture the current owner's work registry before an abort callback runs outside its async scope. */
export const currentRenderWorkTracker = () => runtimes.getStore()?.track;
export function trackRenderChild(child) {
  const track=runtimes.getStore()?.track;
  if(track)track(new Promise(resolve=>child.once('close',()=>resolve())));
  return child;
}
export function videoProgram(name) {
  const context = runtimes.getStore();
  const path = context?.runtime?.[name+'Executable'];
  if (context?.required && !path) throw new Error('A verified video render runtime is required');
  return path ?? name;
}
export function videoBrowser() {
  const context = runtimes.getStore();
  const path = context?.runtime?.browserExecutable;
  if (context?.required && !path) throw new Error('A verified video browser is required');
  return path;
}
