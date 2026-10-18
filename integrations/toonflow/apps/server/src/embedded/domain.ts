import { isAbsolute, resolve } from "node:path";
import type { Server } from "node:http";
import { z } from "zod";
import type { NativeRequest } from "./native";

const bootstrapSchema = z.strictObject({ dataDirectory: z.string().refine(isAbsolute), workspaceRoots: z.array(z.string().refine(isAbsolute)).min(1).max(64),
  guestAuthorization: z.string().regex(/^[a-f0-9]{64}$/),
  gateway: z.strictObject({ origin: z.url().refine(value => /^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(value)), authorization: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
});
export interface EmbeddedAigcDomain {
  start(): Promise<{ origin: string }>;
  invoke(input: unknown, signal: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}
export interface EmbeddedAigcOptions { bootstrap: unknown; resourceDirectory: string; staticDirectory: string; native: NativeRequest; signal?: AbortSignal }

/** A domain factory only: listening and teardown are owned by the Cordis provider. */
export async function createEmbeddedAigcDomain(options: EmbeddedAigcOptions): Promise<EmbeddedAigcDomain> {
  const bootstrap = bootstrapSchema.parse(options.bootstrap);
  if (!isAbsolute(options.resourceDirectory) || !isAbsolute(options.staticDirectory)) throw new Error("AIGC_RESOURCE_PATH_INVALID");
  options.signal?.throwIfAborted();
  Object.assign(process.env, { STUDYBUDDY_EMBEDDED: "1", STUDYBUDDY_NATIVE_AIGC: "1", NODE_ENV: "production", TOONFLOW_DATA_DIR: resolve(bootstrap.dataDirectory) });
  const [{ mkdir }, policy, gateway, native] = await Promise.all([
    import("@toonflow/file"), import("@/utils/studyBuddy/policy"), import("@/utils/studyBuddy/gateway"), import("./native"),
  ]);
  for (const root of bootstrap.workspaceRoots) { await policy.denyLinks(root); await mkdir(root, { recursive: true }); }
  await policy.configurePolicy(bootstrap.guestAuthorization, bootstrap.workspaceRoots);
  await gateway.configureGateway(bootstrap.gateway);
  options.signal?.throwIfAborted();
  const withdrawNative = native.configureNative(options.native);
  const [{ createApp }, { invokeTools }, jobs] = await Promise.all([import("@/app"), import("./tools"), import("@/utils/studyBuddy/jobs")]);
  let server: Server | undefined, starting: Promise<{ origin: string }> | undefined, closing: Promise<void> | undefined;
  let closed = false;
  const close = (): Promise<void> => closing ??= (async () => {
    closed = true; policy.setAdmittedOrigin("");
    const stopped = server ? new Promise<void>((accept, reject) => { server!.close(error => { if (error) reject(error); else accept(); }); server!.closeAllConnections(); }) : Promise.resolve();
    const temporary = await import("@/utils/singleAgent");
    await Promise.all([stopped, jobs.stopOwnedWork(), temporary.closeAll()]); withdrawNative();
    const browser = await import("@/utils/browser"); await browser.closeBrowsers();
    const { default: conf } = await import("@/utils/conf");
    conf._closeWatcher();
  })();
  const abort = () => { void close(); };
  options.signal?.addEventListener("abort", abort, { once: true });
  return {
    start() {
      if (closed) return Promise.reject(new Error("AIGC_SCOPE_REVOKED"));
      return starting ??= (async () => {
        const root = options.resourceDirectory;
        const { migrateBundledPlugins } = await import("./bundledMigration");
        await migrateBundledPlugins(bootstrap.dataDirectory, root);
        const app = await createApp({ webRoot: options.staticDirectory, dataDirectory: bootstrap.dataDirectory,
          toolsRoot: resolve(root, "tools"), nodesRoot: resolve(root, "nodes"), extRoot: resolve(root, "ext"), skillsRoot: resolve(root, "skills"),
          appVersion: "StudyBuddy AIGC", embeddedAuthorize: policy.authorize });
        if (closed || options.signal?.aborted) throw new Error("AIGC_SCOPE_REVOKED");
        return new Promise<{ origin: string }>((accept, reject) => {
          server = app.listen(0, "127.0.0.1", () => {
            const address = server!.address();
            if (closed || options.signal?.aborted) { reject(new Error("AIGC_SCOPE_REVOKED")); void close(); return; }
            if (!address || typeof address === "string") { reject(new Error("AIGC_LISTEN_FAILED")); return; }
            const origin = `http://127.0.0.1:${address.port}`; policy.setAdmittedOrigin(origin); accept({ origin });
          });
          server.once("error", reject);
        });
      })();
    },
    async invoke(input, signal) {
      if (closed || options.signal?.aborted) throw new Error("AIGC_SCOPE_REVOKED");
      const combined = options.signal ? AbortSignal.any([options.signal, signal]) : signal;
      let result:unknown;
      const operation=input&&typeof input==='object'&&'operation'in input?input.operation:undefined;
      if(operation==='capability-project'||operation==='capability-import'){
        const capability=await import('./capability-projects');result=operation==='capability-project'?await capability.capabilityProject(input,bootstrap.workspaceRoots[0]!,combined):await capability.capabilityImport(input,combined);
      }else if(operation==='capability-release-caller'){
        const ask=z.strictObject({operation:z.literal('capability-release-caller'),grantRef:z.string().uuid()}).parse(input);native.releaseNativeCaller(ask.grantRef);result={released:true};
      }else if(operation==='capability-control'){
        const ask=z.strictObject({operation:z.literal('capability-control'),connectionId:z.string().uuid(),name:z.enum(['openProject','flushSave','generationStatus','cancelGeneration']),args:z.record(z.string(),z.json()),directory:z.string().optional(),expected:z.strictObject({canvasId:z.string().nullable(),revision:z.number().int().nonnegative(),operationId:z.string()}).optional()}).parse(input);
        if(ask.directory)await policy.admitWorkspace(ask.directory);if(ask.name==='openProject'){if(typeof ask.args.directory!=='string')throw Error('AIGC_PROJECT_INVALID');await policy.admitWorkspace(ask.args.directory);}
        const control=await import('@/utils/mcp/control');result=await control.queuedControl(ask.connectionId,ask.name,ask.args,combined,ask.directory,ask.expected);
      }else result=await invokeTools(input,combined);
      combined.throwIfAborted();
      if (closed) throw new Error("AIGC_SCOPE_REVOKED"); return result;
    },
    async close() { options.signal?.removeEventListener("abort", abort); await close(); },
  };
}
