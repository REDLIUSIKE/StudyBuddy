/** Authenticated POST route for opening a workspace file on the Host desktop. */
export const PRESENT_OPEN_PATH = '/api/present.open';
/** Authenticated desktop availability and destination metadata. */
export const PRESENT_HOST_PATH = '/api/present.host';
/**
 * Browser-relative form of {@link PRESENT_OPEN_PATH}; see
 * .agents/notes/implemented/architecture/2026-09-14-web-document-relative-app-routes.md.
 */
export const PRESENT_OPEN_ROUTE = PRESENT_OPEN_PATH.slice(1);
/** Browser-relative form of {@link PRESENT_HOST_PATH}. */
export const PRESENT_HOST_ROUTE = PRESENT_HOST_PATH.slice(1);
/**
 * Validate desktop metadata received over HTTP.
 * @param value - decoded response.
 * @returns whether all displayed and actionable fields are supported.
 */
export function isPresentedHost(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const host = value;
    return typeof host.name === 'string' && typeof host.available === 'boolean'
        && (host.fileManager === null || host.fileManager === 'finder'
            || host.fileManager === 'explorer' || host.fileManager === 'directory');
}
/**
 * Validate a file declaration read from a Session log.
 * @param value - decoded durable data.
 * @returns whether the declaration contains a path and optional description.
 */
export function isPresentedFile(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const { path, description } = value;
    return typeof path === 'string' && path.trim().length > 0
        && (description === undefined || typeof description === 'string');
}
/**
 * Build authenticated coordinates for a declared file.
 * @param sessionId - owning Session.
 * @param seq - deliverables/presented event sequence.
 * @param index - original index in the event's files array.
 * @returns document-relative file action route.
 */
export function presentedFileUrl(sessionId, seq, index) {
    return `${PRESENT_OPEN_ROUTE}?${new URLSearchParams({ sessionId, seq: String(seq), index: String(index) })}`;
}
/**
 * Validate a delivery event before reading its turn or file declarations.
 * @param value - decoded durable event data.
 * @returns whether the event identifies a turn, call, and file list.
 */
export function isPresentedData(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const { turn, callId, files } = value;
    return typeof turn === 'number' && Number.isSafeInteger(turn) && turn >= 1
        && typeof callId === 'string' && callId.length > 0 && Array.isArray(files);
}
/**
 * Trailing path segment, the part that identifies the file at a glance.
 * @param path - Slash- or backslash-separated path.
 * @returns The final segment, or the whole string when separator-free.
 */
export function basename(path) {
    const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return at === -1 ? path : path.slice(at + 1);
}
//# sourceMappingURL=presented.js.map