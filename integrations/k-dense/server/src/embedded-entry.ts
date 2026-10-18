/** Private managed executable. Bootstrap precedes configuration or project imports. */
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { StdioNativeChannel } from "./runtime/stdio-channel.ts";
import { ManagedResearchRuntime } from "./runtime/native-channel.ts";

async function handoff(): Promise<{ projectsRoot: string; guestAuthorization: string; toolAuthorization: string }> {
  return new Promise((resolve, reject) => {
    let text = "";
    const read = (chunk: Buffer) => {
      text += chunk.toString("utf8");
      if (Buffer.byteLength(text) > 65536) { cleanup(); reject(Error("RESEARCH_BOOTSTRAP_INVALID")); return; }
      const at = text.indexOf("\n"); if (at < 0) return;
      cleanup();
      try {
        const value: unknown = JSON.parse(text.slice(0, at));
        if (!value || typeof value !== "object" || !("projectsRoot" in value) || typeof value.projectsRoot !== "string" || !path.isAbsolute(value.projectsRoot) ||
          !("guestAuthorization" in value) || typeof value.guestAuthorization !== "string" || !/^[a-f0-9]{64}$/.test(value.guestAuthorization) ||
          !("toolAuthorization" in value) || typeof value.toolAuthorization !== "string" || !/^[a-f0-9]{64}$/.test(value.toolAuthorization) || Object.keys(value).length !== 3) throw Error("RESEARCH_BOOTSTRAP_INVALID");
        // Pause while listeners are replaced; retain any following control bytes.
        process.stdin.pause(); if (text.length > at + 1) process.stdin.unshift(Buffer.from(text.slice(at + 1)));
        resolve({ projectsRoot: value.projectsRoot, guestAuthorization: value.guestAuthorization, toolAuthorization: value.toolAuthorization });
      } catch (error) { reject(error); }
    };
    const ended = () => { cleanup(); reject(Error("RESEARCH_BOOTSTRAP_CLOSED")); };
    const cleanup = () => { process.stdin.off("data", read); process.stdin.off("end", ended); };
    process.stdin.on("data", read); process.stdin.once("end", ended);
  });
}

/** Serve frontend and existing file APIs on one admitted loopback origin. */
async function main(): Promise<void> {
  const bootstrap = await handoff();
  process.env.KADY_RUNTIME_PROFILE = "studybuddy";
  process.env.KADY_PROJECTS_ROOT = bootstrap.projectsRoot;
  process.env.PI_CODING_AGENT_DIR = path.join(path.dirname(bootstrap.projectsRoot), "native-adapters");
  process.env.KADY_SKILLS_CACHE_DIR = path.join(path.dirname(bootstrap.projectsRoot), "skills-cache");
  const webDirectory = path.join(process.cwd(), "web");
  if (!fs.existsSync(path.join(webDirectory, ".next/BUILD_ID"))) throw Error("RESEARCH_FRONTEND_BUILD_MISSING");
  let origin: string | undefined, closing = false;
  let shutdown = async () => {};
  const channel = new StdioNativeChannel(process.stdin, process.stdout, () => { void shutdown(); });
  process.stdin.resume();
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
  const journal = new NativeJournalImporter({ current: context => managed.current(context) && !closing,
    read: (context, afterSeq) => channel.request(context.projectId, "journal", { afterSeq }, new AbortController().signal, context.sessionRef) });
  const app = await buildEmbeddedApp({ ...bootstrap, origin: () => origin, isCurrent: () => channel.current() && !closing,
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
  const load = createRequire(path.join(webDirectory, "package.json"));
  const next = load("next") as (options: { dev: boolean; dir: string; hostname: string; port: number;conf:Record<string,unknown> }) => {
    prepare(): Promise<void>; getRequestHandler(): (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>; close(): Promise<void>;
  };
  // Use the configuration serialized with this exact production build. The
  // packaged process has no development compiler and never installs one.
  const buildFiles=JSON.parse(fs.readFileSync(path.join(webDirectory,'.next/required-server-files.json'),'utf8')) as {config?:unknown};
  if(!buildFiles.config||typeof buildFiles.config!=='object'||Array.isArray(buildFiles.config))throw Error('RESEARCH_FRONTEND_CONFIG_INVALID');
  const frontend = next({ dev: false, dir: webDirectory, hostname: "127.0.0.1", port: 0,conf:buildFiles.config as Record<string,unknown> });
  await frontend.prepare(); await app.ready();
  const handler = frontend.getRequestHandler();
  const server = createServer((req, res) => {
    if (!channel.current() || !origin || req.headers.host !== new URL(origin).host || (req.headers.origin !== undefined && req.headers.origin !== origin) || req.headers["x-studybuddy-research-guest"] !== bootstrap.guestAuthorization) {
      res.writeHead(403).end("Research page access expired"); return;
    }
    if (req.url?.startsWith("/api/")) { req.url = req.url.slice(4); app.routing(req, res); }
    else void handler(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  shutdown = async () => {
    if (closing) return;await workflows.close();await provenance.close();disposeResultLookup();closing = true;await independentServices?.close(); managed.revoke(); channel.close();
    server.closeAllConnections(); await new Promise<void>(resolve => { server.close(() => resolve()); });
    await app.close(); await frontend.close(); process.stdin.destroy();
  };
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
  process.stdin.once("end", () => { void shutdown(); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("RESEARCH_BIND_FAILED");
  origin = `http://127.0.0.1:${address.port}`;
  process.stdout.write(JSON.stringify({ type: "ready", origin }) + "\n");
}

main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.message : "RESEARCH_START_FAILED") + "\n");
  process.exitCode = 1; process.stdin.destroy();
});
