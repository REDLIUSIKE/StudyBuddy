/**
 * Host desktop availability, file associations, and open/reveal actions over the Session Remote.
 * The desktop answer is read once per page; a failed read renders no control.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/** Page-lifetime desktop availability and the open/reveal carrier shared by every path control. */
export class OpenInAppPathController {
    remote;
    /** Whether the Host desktop can open paths; null until the Host answered, false also after a failed read. */
    desktop = createSnapshotStore(null);
    loading;
    /**
     * @param remote - the Session Remote namespace answering availability and running gestures.
     */
    constructor(remote) {
        this.remote = remote;
    }
    /**
     * Read desktop availability once per controller life; concurrent calls share the read.
     * @returns after availability is published.
     */
    load() {
        this.loading ??= this.run();
        return this.loading;
    }
    /**
     * Open one Host path in its default application, or reveal it in the file manager.
     * @param path - absolute path on the Host, as the file's metadata reports it.
     * @param action - default application open, or file-manager reveal.
     * @param application - registered application path for an explicit open.
     * @returns the failure kind to announce, or `null` once the Host acknowledged.
     */
    async openPath(path, action, application) {
        const request = action === 'reveal' ? { path, action } : { path, ...(application === undefined ? {} : { application }) };
        let ok = false;
        try {
            ok = (await this.remote.session.openWorkspacePath(request)).ok;
        }
        catch {
            // Swallows carrier rejections: a Host that cannot be reached failed the
            // gesture like a Host that refused it, and the control announces that.
        }
        return ok ? null : action === 'open' ? 'openError' : 'revealError';
    }
    /**
     * Refresh the file's OS associations; failures remain distinct from an empty handler list.
     * @param path - file path reported by the Host.
     * @param signal - lifetime of the requesting preview.
     * @returns application metadata, or null when the query fails.
     */
    async applications(path, signal) {
        let result;
        try {
            result = await this.remote.session.workspacePathApplications({ path }, signal);
        }
        catch (_error) {
            // The control reports query failure and keeps file reveal available.
            return null;
        }
        return result.ok ? result.value : null;
    }
    async run() {
        let available = false;
        try {
            const result = await this.remote.session.canOpenWorkspacePath();
            available = result.ok && result.value;
        }
        catch {
            // Swallows carrier rejections: an unreachable Host reads as no desktop,
            // so the preview shows no path control rather than a broken one.
        }
        this.desktop.set(available);
    }
}
//# sourceMappingURL=open-path.js.map