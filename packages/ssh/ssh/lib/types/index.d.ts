/** OpenSSH connection owner for one version-matched POSIX helper and its independent forwarded streams. */
import { type Socket } from 'node:net';
import { Context, Service } from '@deepseek-ai/cordis';
import schema from '@deepseek-ai/schemastery';
import { z } from 'zod';
import { helloSchema, type SshStreamEndpoint } from './schemas.ts';
type Hello = z.infer<typeof helloSchema>;
/** Installed helper invocation; script deployments may also install a PTC bootstrap. */
export type HelperLaunch = {
    /** Run the installed script with a separately installed Node executable. */
    kind: 'node-script';
    /** Absolute remote Node executable. */
    node: string;
    /** Absolute remote PTC bootstrap; requires bootstrapHash. */
    bootstrapPath?: string;
    /** Lowercase SHA-256 of bootstrapPath; requires that path. */
    bootstrapHash?: string;
} | {
    /** Run the helper executable with its embedded Node and PTC worker. */
    kind: 'executable';
};
/** Deployment-owned SSH identity and installed helper; no model argument selects these values. */
export interface Config {
    /** OpenSSH host alias, including its existing user, key and known-host configuration. */
    host: string;
    /** Explicit script or self-contained executable invocation. */
    launch: HelperLaunch;
    /** Absolute path to the installed, bundled helper entry. */
    helper: string;
    /** SHA-256 of that bundled helper; mismatches refuse the connection. */
    helperHash: string;
    /** Absolute remote default workspace. */
    workspace: string;
    /** Connection and administrative-request deadline, at most 2,147,483,647 milliseconds. */
    requestTimeoutMs?: number;
    /** Maximum JSON payload bytes per helper request or response. */
    maxFrameBytes?: number;
    /** Maximum ordinary requests; heartbeat and bounded resource cleanup have reserved capacity. */
    maxPending?: number;
    /** Remote helper lease; loss of heartbeats starts remote managed cleanup. */
    leaseMs?: number;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        ssh: SshConnection;
    }
}
/** One non-reconnecting SSH session; loss invalidates all active operations. */
export declare class SshConnection extends Service {
    static Config: schema<Config>;
    /** Verified remote helper coordinates; callers must await this before launch. */
    readonly ready: Promise<Hello>;
    private rpc;
    private child;
    private childClosed;
    private directory;
    private heartbeat;
    private closed;
    private readonly lifetime;
    private readonly operations;
    private disposal;
    private failure;
    private sockets;
    private nextSocket;
    private readonly config;
    private remote;
    constructor(ctx: Context, config: Config);
    /** Hold plugin readiness until the remote identity and helper digest are verified. */
    [Service.init](): Promise<void>;
    /** Verified remote PTC launch configuration; script deployments require a verified bootstrap. */
    get ptcLaunch(): {
        kind: 'embedded';
        executable: string;
    } | {
        kind: 'node-script';
        executable: string;
        bootstrapPath: string;
    };
    /**
     * Send a helper operation; cancellation never replays an ambiguous mutation.
     * @param method - the private helper operation.
     * @param params - JSON request fields validated by the helper.
     * @param result - response validation before returning provider-visible data.
     * @param signal - cancellation, which does not undo completed remote effects.
     * @param wait - allow a process observation to outlast the administrative deadline.
     * @returns the validated remote result.
     */
    request<T>(method: string, params: unknown, result: z.ZodType<T>, signal?: AbortSignal, wait?: boolean): Promise<T>;
    /**
     * Forward one authenticated stream through an independent SSH channel.
     * @param endpoint - private coordinates issued by this connection's helper.
     * @param signal - cancellation of allocation and the resulting socket.
     * @returns a paused socket; attach a consumer before resuming it.
     */
    connectStream(endpoint: SshStreamEndpoint, signal?: AbortSignal): Promise<Socket>;
    private establishStream;
    /** Tear down the helper's remote managed ranges before releasing the SSH master when reachable. */
    dispose(): Promise<void>;
    private disposeOnce;
    private controlPath;
    private assertOpen;
    private track;
    private controlCommand;
    private fail;
    private start;
}
export default SshConnection;
//# sourceMappingURL=index.d.ts.map