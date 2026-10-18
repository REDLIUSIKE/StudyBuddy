/** Account-owned non-model services, retaining upstream validation and compute recovery. */
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { NativeServiceCredentials } from '../runtime/native-service-credentials.ts';
import { validateModalCredentials } from '../modal/adapter.ts';
import { validatePaperclipApiKey, connectPaperclipKey, disconnectPaperclipKey } from '../agent/paperclip.ts';
import { assertResearchPath } from '../runtime/project-storage.ts';
import { modalJobManager } from '../modal/manager.ts';
import { notebookRobustness } from '../agent/notebook-robustness.ts';
import {currentProjectId} from '../scope.ts';
import type {NativeIndependentServices} from '../runtime/independent-services.ts';
/** Register only independent services; model credentials remain in the native gateway controls. */
export async function registerEmbeddedServiceRoutes(app: FastifyInstance, options: { accountDirectory: string; current(): boolean }): Promise<NativeServiceCredentials> {
  const directory = path.join(options.accountDirectory, 'native-adapters'); assertResearchPath(directory);
  const store = new NativeServiceCredentials({ file: path.join(directory, 'services.json'), current: options.current, validateModal: validateModalCredentials, validatePaperclip: validatePaperclipApiKey });
  store.applyEnvironment();
  app.get('/credentials', async () => store.status());
  app.get('/research/services',async()=>store.selection());
  app.put('/research/services',async(request,reply)=>{try{return await store.select(request.body);}catch(error){return reply.code((error as {statusCode?:number}).statusCode??400).send({detail:(error as Error).message});}});
  app.put('/credentials', async (request, reply) => {
    try {
      assertResearchPath(path.join(directory, 'mcp.json'));
      const saved = await store.update(request.body);
      if (request.body && typeof request.body === 'object' && 'paperclipApiKey' in request.body) {
        if (saved.paperclip?.set) connectPaperclipKey(directory); else disconnectPaperclipKey(directory);
      }
      if (request.body&&typeof request.body==='object'&&('modalTokenId' in request.body||'modalTokenSecret' in request.body)&&saved.modalTokenId?.set && saved.modalTokenSecret?.set) {
        await modalJobManager.recoverAllProjects(); await notebookRobustness.recoverAll();
      }
      return saved;
    } catch (error) { return reply.code((error as { statusCode?: number }).statusCode ?? 400).send({ detail: (error as Error).message }); }
  });
  return store;
}
/** Public controls are local metadata and explicit owned cancellation/shutdown; allocation stays native-only. */
export async function registerIndependentJobRoutes(app:FastifyInstance,services:NativeIndependentServices):Promise<void>{
  app.get('/autodl/jobs',async()=>({jobs:services.autodl.list(currentProjectId())}));
  app.get<{Params:{id:string};Querystring:{offset?:string}}>('/autodl/jobs/:id/logs',async request=>services.autodl.logs(currentProjectId(),request.params.id,request.query.offset===undefined?0:Number(request.query.offset)));
  app.post<{Params:{id:string;action:string}}>('/autodl/jobs/:id/:action',async(request,reply)=>{
    if(request.body!==undefined&&request.body!==null&&Object.keys(request.body as object).length) return reply.code(400).send({detail:'AUTODL_CONTROL_INPUT_INVALID'});
    if(request.params.action==='cancel')return services.autodl.cancel(currentProjectId(),request.params.id);
    if(request.params.action==='shutdown')return services.autodl.shutdown(currentProjectId(),request.params.id);
    if(request.params.action==='reconcile')return services.autodl.reconcile(currentProjectId(),request.params.id);
    return reply.code(400).send({detail:'AUTODL_CONTROL_INPUT_INVALID'});
  });
}
