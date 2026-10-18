/** Embedded domain provider. Its importer owns process/stdio lifecycle. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { NativeChannel } from './runtime/native-channel.ts';
export { StdioNativeChannel } from './runtime/stdio-channel.ts';
export interface EmbeddedResearchDomainOptions { projectsRoot: string; guestAuthorization: string; toolAuthorization: string; staticDirectory: string; channel: NativeChannel; signal?: AbortSignal; pythonExecutable?: string }
export interface EmbeddedResearchDomain { app: FastifyInstance; start(): Promise<{ origin: string }>; close(): Promise<void> }
let admittedRoot: string | undefined;
export async function createEmbeddedResearchDomain(options: EmbeddedResearchDomainOptions): Promise<EmbeddedResearchDomain> {
  options.signal?.throwIfAborted();
  const bootstrap = options, channel = options.channel;
  if (!path.isAbsolute(options.projectsRoot) || !path.isAbsolute(options.staticDirectory) || !/^[a-f0-9]{64}$/.test(options.guestAuthorization) || !/^[a-f0-9]{64}$/.test(options.toolAuthorization) || !channel.current()) throw Error('RESEARCH_HOST_REQUIRED');
  if (options.pythonExecutable !== undefined) {
    if (!path.isAbsolute(options.pythonExecutable) || !fs.lstatSync(options.pythonExecutable).isFile()) throw Error('RESEARCH_PYTHON_EXECUTABLE_INVALID');
    for (let current = path.resolve(options.pythonExecutable);;) { if (fs.lstatSync(current).isSymbolicLink()) throw Error('RESEARCH_PYTHON_EXECUTABLE_INVALID'); const parent = path.dirname(current); if (parent === current) break; current = parent; }
  }
  const root = path.resolve(options.projectsRoot);
  if (admittedRoot !== undefined && admittedRoot !== root) throw Error('RESEARCH_DOMAIN_ROOT_CONFLICT');
  admittedRoot = root;
  if (options.pythonExecutable !== undefined) process.env.KADY_PYTHON = options.pythonExecutable;
  // This must precede all imports that capture account/project configuration.
  Object.assign(process.env, { KADY_RUNTIME_PROFILE: 'studybuddy', KADY_PROJECTS_ROOT: root });
  process.env.PI_CODING_AGENT_DIR = path.join(path.dirname(root), 'native-adapters');
  process.env.KADY_SKILLS_CACHE_DIR = path.join(path.dirname(root), 'skills-cache');
  process.env.KADY_SUBAGENT_RESOURCES_DIR = fileURLToPath(new URL('./subagents-resources', import.meta.url));
  let origin: string | undefined, closing = false, server: Server | undefined, app: FastifyInstance | undefined, listenerReady: Promise<void> | undefined;
  let dispose = async () => {}, closePromise: Promise<void> | undefined, finishInitialization!: () => void;
  const initialized = new Promise<void>(resolve => { finishInitialization = resolve; });
  const close = (): Promise<void> => {
    if (!closePromise) { closing = true; closePromise = (async () => {
      await initialized; await listenerReady?.catch(() => {}); options.signal?.removeEventListener('abort', aborted);
      server?.closeAllConnections();
      const results = await Promise.allSettled([dispose(), app?.close(), new Promise<void>(resolve => { if (!server?.listening) resolve(); else server.close(() => resolve()); })]);
      const errors = results.filter((row): row is PromiseRejectedResult => row.status === 'rejected').map(row => row.reason); if (errors.length) throw new AggregateError(errors, 'RESEARCH_DOMAIN_CLOSE_FAILED');
    })(); } return closePromise;
  };
  const aborted = () => { void close().catch(() => {}); };
  options.signal?.addEventListener('abort', aborted, { once: true });
  try {
  const { ManagedResearchRuntime } = await import('./runtime/native-channel.ts');
  const managed = new ManagedResearchRuntime(channel);
  const { buildEmbeddedApp } = await import("./bootstrap-embedded.ts");
  const [{ NativeScientificHelpers }, { registerEmbeddedScientificRoutes }] = await Promise.all([import("./runtime/native-scientific-helpers.ts"), import("./api/embedded-scientific.ts")]);
  const helpers = new NativeScientificHelpers({ project: async projectId => {
    const context = await managed.bind(projectId); return { context, runtime: managed.forContext(context) };
  }, current: context => managed.current(context) && !closing });
  const { NativeJournalImporter } = await import("./runtime/native-journal.ts");
  const { NativeProjectExporter } = await import('./runtime/native-project-export.ts');
  const { listStoredPiSessions } = await import('./agent/session-files.ts');
  const { resolvePaths } = await import('./projects.ts');
  const exporter = new NativeProjectExporter(channel);
  const { NativeModelDirectory } = await import('./runtime/native-model-directory.ts');
  const { registerAgentRoutes } = await import('./api/agents.ts');
  const { registerMcpRoutes } = await import('./api/mcp.ts');
  const { currentProjectId } = await import('./scope.ts');
  const models = new NativeModelDirectory(channel);
  const {registerNativeCompositionRoutes}=await import('./api/native-compositions.ts');
  const {NativeAdvancedWorkflows}=await import('./runtime/native-advanced.ts');
  const advanced=new NativeAdvancedWorkflows(channel);
  const {NativeResearchWorkflows}=await import('./runtime/native-workflows.ts');
  const workflows=new NativeResearchWorkflows(channel,advanced);
  const {NativeResearchSchedules}=await import('./runtime/native-schedules.ts');
  const {registerNativeScheduleRoutes}=await import('./api/native-schedules.ts');
  const schedules=new NativeResearchSchedules({channel,freeze:(project,session,call,params)=>workflows.prepare(project,session,call,params)});
  const {NativeResearchGoals}=await import('./runtime/native-goals.ts');
  const goals=new NativeResearchGoals(channel);
  const {NativeProvenance,NativeScientificResultSource}=await import('./runtime/native-provenance.ts');
  const {setNativeNotebookResultLookup}=await import('./agent/notebook-results.ts');
  const provenance=new NativeProvenance({current:()=>channel.current()&&!closing});
  const resultSource=new NativeScientificResultSource({current:()=>channel.current()&&!closing,nativeSession:async(project,session)=>{
    if(!session.startsWith('session-'))return false;
    const listing=await channel.request(project,'journal-sessions',null,new AbortController().signal);
    if(!listing||typeof listing!=='object'||!('sessions'in listing)||!Array.isArray(listing.sessions)||!listing.sessions.some(row=>row&&typeof row==='object'&&row.id===session))throw Error('RESEARCH_NATIVE_RESULT_OWNER_DENIED');return true;
  },page:(project,session,cursor,endSeq)=>channel.request(project,'journal-export',{cursor,endSeq},new AbortController().signal,session)});
  const disposeResultLookup=setNativeNotebookResultLookup((project,session,ids,budget)=>resultSource.lookup(project,session,ids,budget));
  const {NativeResearchMissions}=await import('./runtime/native-missions.ts');
  const {registerNativeMissionRoutes}=await import('./api/native-missions.ts');
  const {registerNativeFleetRoutes}=await import('./api/native-fleet.ts');
  const missions=new NativeResearchMissions({current:()=>channel.current()&&!closing,goals,inspect:(project,session,call,input)=>advanced.specialist(project,session,call,input)});
  const { registerEmbeddedToolRoutes } = await import("./api/embedded-tools.ts");
  const {NativeProjectBudget}=await import('./runtime/native-project-budget.ts');
  const {registerNativeBudgetRoutes}=await import('./api/native-budget.ts');
  const budget=new NativeProjectBudget({directory:id=>resolvePaths(id).sandbox,current:()=>channel.current()&&!closing,read:(requests,id)=>channel.request(id,'settlements',{requests},new AbortController().signal)});
  const { registerEmbeddedWorkspaceRoutes } = await import("./api/embedded-workspace.ts");
  const { registerEmbeddedResourceRoutes } = await import("./api/embedded-resources.ts");
  const { registerEmbeddedServiceRoutes,registerIndependentJobRoutes } = await import("./api/embedded-services.ts");
  const {NativeIndependentServices}=await import('./runtime/independent-services.ts');
  let independentServices:InstanceType<typeof NativeIndependentServices>|undefined;
  dispose = async () => {
    const results = await Promise.allSettled([workflows.close(), provenance.close(), independentServices?.close()]);
    disposeResultLookup(); managed.revoke();
    const errors = results.filter((row): row is PromiseRejectedResult => row.status === 'rejected').map(row => row.reason); if (errors.length) throw new AggregateError(errors, 'RESEARCH_DOMAIN_DISPOSE_FAILED');
  };
  const journal = new NativeJournalImporter({ current: context => managed.current(context) && !closing,
    read: (context, afterSeq) => channel.request(context.projectId, "journal", { afterSeq }, new AbortController().signal, context.sessionRef) });
  app = await buildEmbeddedApp({ ...bootstrap, origin: () => origin, isCurrent: () => channel.current() && !closing,
    context: id => managed.bind(id),
    latexAssist: (request, projectId) => helpers.latexAssist(request, projectId),
    archive: async projectId => ({ sessions: await listStoredPiSessions(resolvePaths(projectId)), nativeSessions: await exporter.sessions(projectId) }),
    registerFeatures: async app => {
      const { registerNativeSpeechRoutes } = await import("./api/native-speech.ts");
      await registerNativeSpeechRoutes(app, { projectsRoot: bootstrap.projectsRoot, channel, context: id => managed.bind(id), budget });
      app.get('/research/models', async () => models.refresh(currentProjectId()));
      await registerNativeCompositionRoutes(app,models,()=>channel.current()&&!closing);
      await registerNativeBudgetRoutes(app,budget,()=>channel.current()&&!closing);
      await registerNativeMissionRoutes(app,{missions,current:()=>channel.current()&&!closing,context:id=>managed.bind(id)});
      await registerNativeScheduleRoutes(app,{schedules,current:()=>channel.current()&&!closing,context:id=>managed.bind(id)});
      await registerNativeFleetRoutes(app,advanced);
      await registerAgentRoutes(app, { models: { available: ref => models.available(ref), require: ref => models.require(currentProjectId(), ref), refresh: async () => { await models.refresh(currentProjectId()); } } });
      const store=await registerEmbeddedServiceRoutes(app, { accountDirectory: path.dirname(bootstrap.projectsRoot), current: () => channel.current() && !closing });
      independentServices=new NativeIndependentServices({store,directory:path.join(path.dirname(bootstrap.projectsRoot),'native-adapters','independent-services'),current:()=>channel.current()&&!closing});
      await registerIndependentJobRoutes(app,independentServices);
      await registerMcpRoutes(app, { providerSignedIn: async () => false });
      await registerEmbeddedScientificRoutes(app, helpers, id => managed.bind(id), context => journal.refresh(context));
      await registerEmbeddedToolRoutes(app, { authorization: bootstrap.toolAuthorization, current: () => channel.current() && !closing, context: id => managed.bind(id),services:independentServices,advanced,budget,missions,schedules,workflows,provenance });
      await registerEmbeddedWorkspaceRoutes(app, () => channel.current() && !closing);
      await registerEmbeddedResourceRoutes(app, { current: () => channel.current() && !closing, context: id => managed.bind(id) });
    },
    beforeDelete: async projectId => {await workflows.close(projectId);await provenance.close(projectId);await independentServices?.close(projectId); await channel.request(projectId, "project-close", null, new AbortController().signal); },
  });

  const { createStaticResearchHandler } = await import('./runtime/static-http.ts');
  const frontend = createStaticResearchHandler(options.staticDirectory);
  const disposeServices = dispose;
  dispose = async () => {
    const results = await Promise.allSettled([disposeServices(), frontend.close()]);
    const errors = results.filter((row): row is PromiseRejectedResult => row.status === 'rejected').map(row => row.reason); if (errors.length) throw new AggregateError(errors, 'RESEARCH_DOMAIN_DISPOSE_FAILED');
  };
  await app.ready(); options.signal?.throwIfAborted();
  server = createServer((req, res) => {
    const supplied = req.headers['x-studybuddy-research-guest']; const expected = Buffer.from(bootstrap.guestAuthorization);
    if (closing || !channel.current() || !origin || req.headers.host !== new URL(origin).host || (req.headers.origin !== undefined && req.headers.origin !== origin) || typeof supplied !== 'string' || Buffer.byteLength(supplied) !== expected.length || !timingSafeEqual(Buffer.from(supplied), expected)) { res.writeHead(403).end('Research page access expired'); return; }
    if (req.url?.startsWith('/api/')) { req.url = req.url.slice(4); app!.routing(req, res); }
    else void frontend.serve(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  let starting: Promise<{ origin: string }> | undefined;
  return { app, close, start() {
    if (closing || !channel.current()) return Promise.reject(Error('RESEARCH_DOMAIN_CLOSED'));
    return starting ??= (async () => {
      listenerReady = new Promise<void>((resolve, reject) => { const failed = (error: Error) => { server!.off('error', failed); reject(error); }; server!.once('error', failed); server!.listen(0, '127.0.0.1', () => { server!.off('error', failed); resolve(); }); });
      await listenerReady;
      if (closing || !channel.current()) { await close(); throw Error('RESEARCH_DOMAIN_CLOSED'); }
      const address = server!.address(); if (!address || typeof address === 'string') throw Error('RESEARCH_BIND_FAILED'); origin = 'http://127.0.0.1:' + address.port; return { origin };
    })();
  } };
  } catch (error) { finishInitialization(); await close(); throw error; }
  finally { finishInitialization(); }
}
