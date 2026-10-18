/**
 * RemoteMock scenario for built-client tests that do not own a Host.
 * The adjacent JSON is maintained with this module when Remote responses or
 * the current Session header version change.
 * Fixture Sessions have no retained Host terminals to restore.
 */
import { RemoteMock } from '@deepseek-ai/dsh-remote-mock';
export interface AssembledRemoteOptions {
    /** Override the schema-resolved Host preference for developer-tool scenarios. */
    readonly developerTools?: boolean;
    /** Return the fixture's image-dimension admission error from Session prompt. */
    readonly rejectPrompt?: boolean;
}
export interface AssembledRemote {
    readonly mock: RemoteMock;
}
/** Create one isolated RemoteMock world for an assembled built-client case. */
export declare function createAssembledRemote(options?: AssembledRemoteOptions): AssembledRemote;
//# sourceMappingURL=assembled-remote.d.ts.map