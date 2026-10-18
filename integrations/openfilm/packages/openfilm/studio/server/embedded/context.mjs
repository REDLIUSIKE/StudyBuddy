import { AsyncLocalStorage } from 'node:async_hooks';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { withRenderRuntime } from '../../../src/runtime.mjs';
import {withMediaLinksHome} from '../../../src/media-links.mjs';

const contexts = new AsyncLocalStorage();
const callers = new AsyncLocalStorage();
export const currentStudioCaller = () => callers.getStore();
export function withStudioCaller(caller,callback){
 if(!caller||Object.keys(caller).sort().join(',')!=='grantRef,schemaVersion,sessionId,toolCallId'||caller.schemaVersion!==1||!(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(caller.grantRef))||![caller.sessionId,caller.toolCallId].every(value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)))throw Error('VIDEO_CALLER_INVALID');
 return callers.run(Object.freeze({...caller}),callback);
}
const activeEdits = new AsyncLocalStorage();
const editQueues = new WeakMap();
const projectWork = new WeakMap();
const projectCancellations = new WeakMap();
function projectController(context,root){let projects=projectCancellations.get(context);if(!projects){projects=new Map();projectCancellations.set(context,projects);}let controller=projects.get(root);if(!controller){controller=new AbortController();projects.set(root,controller);}return controller;}
function track(context,root,pending){let projects=projectWork.get(context);if(!projects){projects=new Map();projectWork.set(context,projects);}let tasks=projects.get(root);if(!tasks){tasks=new Set();projects.set(root,tasks);}tasks.add(pending);void pending.finally(()=>{tasks.delete(pending);if(!tasks.size&&projects.get(root)===tasks)projects.delete(root);}).catch(()=>{});return pending;}
export const currentStudioContext = () => contexts.getStore();
export const withStudioContext = (context, callback) => contexts.run(context, () => withMediaLinksHome(context?.stateRoot,()=>withRenderRuntime(context?.renderRuntime,callback,!!context,context?.signal,context?work=>track(context,'',work):undefined),context?.pathAdmissions?.linkedMediaAdmissions()));
export function studioProjectSignal(root){const context=currentStudioContext(),signals=[context?.signal,context?.projectSignalForRoot?.(root)].filter(Boolean);return signals.length?AbortSignal.any(signals):undefined;}
export function withStudioProject(root,callback){const context=currentStudioContext();if(!context)return callback();const signal=AbortSignal.any([studioProjectSignal(root),projectController(context,root).signal].filter(Boolean));return track(context,root,Promise.resolve().then(()=>withRenderRuntime(context.renderRuntime,()=>{signal.throwIfAborted();return callback();},true,signal,work=>track(context,root,work))));}
/** Cancel every pending operation for this root, including previews started by the project library. */
export function cancelStudioProjectWork(context,root){projectCancellations.get(context)?.get(root)?.abort();}
export async function waitForStudioProjectWork(context,root){for(;;){const projects=projectWork.get(context),pending=root===undefined?[...(projects?.values()??[])].flatMap(tasks=>[...tasks]):[...(projects?.get(root)??[])];if(!pending.length){const owners=projectCancellations.get(context);if(root!==undefined&&owners?.get(root)?.signal.aborted)owners.delete(root);return;}await Promise.allSettled(pending);}}
export function bindStudioContext(callback) {
  const context = currentStudioContext();
  const caller = currentStudioCaller();
  return (...args) => withStudioContext(context, () => caller?withStudioCaller(caller,()=>callback(...args)):callback(...args));
}
export function withStudioEdit(root, callback) {
  const context = currentStudioContext();
  if (!context) return callback();
  const signal=studioProjectSignal(root);signal?.throwIfAborted();
  const active = activeEdits.getStore();
  if (active?.context === context && active.root === root) return callback();
  let queues = editQueues.get(context);
  if (!queues) { queues = new Map(); editQueues.set(context,queues); }
  const previous = queues.get(root) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => {signal?.throwIfAborted();return activeEdits.run({context,root},callback);});
  queues.set(root,next);
  void next.finally(() => { if (queues.get(root) === next) queues.delete(root); }).catch(() => {});
  return next;
}
export async function waitForStudioEdits(context) {
  await Promise.allSettled([...(editQueues.get(context)?.values() ?? [])]);
}
export function realDestination(path) {
  let ancestor = resolve(path);
  const suffix = [];
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error('No existing ancestor for admitted path');
    suffix.unshift(relative(parent, ancestor));
    ancestor = parent;
  }
  return resolve(realpathSync(ancestor), ...suffix);
}
export function assertStudioPath(path, root) {
  const context=currentStudioContext();
  if(root===undefined&&context?.pathAdmissions)return context.pathAdmissions.projectPath(path);
  root??=context?.workspaceRoot;
  if (!root) return resolve(path);
  const base = realDestination(root);
  const target = realDestination(path);
  const rel = relative(base,target);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..'+sep))
    throw new Error('Path escapes the admitted video workspace');
  return target;
}
export function hasFilmAuthorization(req, context = currentStudioContext()) {
  if (!context) return true;
  if (context.signal.aborted) return false;
  const supplied = req.headers['x-studio-key'];
  if (typeof supplied !== 'string') return false;
  const a = Buffer.from(supplied), b = Buffer.from(context.guestAuthorization);
  return a.length === b.length && timingSafeEqual(a,b);
}
