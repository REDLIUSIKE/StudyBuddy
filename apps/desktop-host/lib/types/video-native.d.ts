/** Native subtitle translation and Session-log exports for an admitted video project. */
import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { VideoProjectBinding } from './video-control-wire.d.ts';
/** Use one persisted, tool-free native child; repeated completed requests read their original result.
 * @param ctx - Native Host services.
 * @param binding - Current project and parent Session selected by Main.
 * @param id - Stable UUIDv4 for this exact translation input.
 * @param value - Target language and ordered source lines.
 * @param signal - Owned operation cancellation.
 * @param check - Reject revoked account/project ownership.
 * @returns Translated lines in their original order.
 */
export declare function translateVideoLines(ctx: Context, binding: VideoProjectBinding, id: string, value: unknown, signal: AbortSignal, check: () => void, callerSessionId?: string): Promise<{
    lines: string[];
}>;
/** Stream an existing native archive into project-owned chat metadata without crossing a junction.
 * @param root - Canonical admitted project root.
 * @param id - Export UUIDv4.
 * @param stream - Harness Session archive bytes.
 * @param signal - Owned export cancellation.
 * @param check - Reject revoked account/project ownership.
 * @returns Local artifact metadata, without inline archive bytes.
 */
export declare function writeVideoSessionArchive(root: string, id: string, stream: ReadableStream<Uint8Array>, signal: AbortSignal, check: () => void): Promise<{
    relativePath: string;
    sha256: string;
    mime: string;
}>;
/** Export the current native Session with its descendants and referenced attachments.
 * @param ctx - Existing native persistence/query/attachment services.
 * @param binding - Current project and Session admission.
 * @param id - Export UUIDv4.
 * @param signal - Owned operation cancellation.
 * @param check - Reject revoked account/project ownership.
 * @returns One local ZIP artifact for the original project's chat export option.
 */
export declare function exportVideoSession(ctx: Context, binding: VideoProjectBinding, id: string, signal: AbortSignal, check: () => void): Promise<{
    data: {
        state: string;
        nativeSessionId: SessionId;
    };
    artifacts: {
        relativePath: string;
        sha256: string;
        mime: string;
    }[];
    receiptRef: string;
}>;
//# sourceMappingURL=video-native.d.ts.map