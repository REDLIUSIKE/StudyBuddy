/**
 * Default responses for every Remote endpoint the web assembly calls while
 * booting and rendering with no sessions, no workspaces, and default settings.
 * The comment above each row names the plugin that calls it; endpoints boot
 * never touches stay absent so a new call fails loud. `$events` is built into
 * `RemoteMock`.
 * @module @deepseek-ai/dsh-client-test-runtime/src/assembly/remote-default-responses
 */
import { type RemoteTable } from '@deepseek-ai/dsh-remote-mock';
/** Default responses of the boot-time Remote endpoints; a spec loads it first and layers its own table on top. */
export declare const remoteDefaultResponses: RemoteTable;
//# sourceMappingURL=remote-default-responses.d.ts.map