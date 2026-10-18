import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
/**
 * The session and path one `dsh-resource://file/…` address names.
 *
 * A `session` address names its own session and a relative or absolute path, so
 * a tab addressed into another session reads from that session. An `absolute`
 * address carries no session and cannot be read here. The registry routes only
 * session-scoped `file` addresses to this type, so an address `parseFileAddress`
 * rejects or that carries no session is a programming error and throws.
 * @param address - a tab's `dsh-resource://file/…` address.
 * @returns the session and the path to hand the endpoint.
 */
export function hostFileOf(address) {
    const parsed = parseFileAddress(address);
    if (parsed?.scope !== 'session')
        throw new Error(`ui-sidebar-documentpreview: not a session file address "${address}"`);
    // The address is a string boundary: its id segment is the Session id it names.
    return { sessionId: parsed.sessionId, path: parsed.path };
}
/**
 * Bind the paged read to one Remote face. The page length is the Host's
 * configured cap, so no `limit` travels.
 * @param remote - the Client Remote carrying the `workspaceFiles` namespace.
 * @returns the read the face performs.
 */
export function createReadPage(remote) {
    return (sessionId, path, offset, signal) => remote.workspaceFiles.read(sessionId, path, { offset }, signal);
}
//# sourceMappingURL=rpc.js.map