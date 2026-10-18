/** Native quit confirmation; quitting proceeds silently only when the Host reports nothing to interrupt. */
/**
 * Choose the confirmation copy for one inspection result.
 * @param inspection - Host answer, or `unknown` when the inspection failed or missed its deadline.
 * @returns the explanation key; an unknown state warns about running tasks rather than quitting silently.
 */
export function resolveDesktopQuitPrompt(inspection) {
    if (inspection === 'unknown')
        return 'quitActiveTasks';
    if (inspection.activeTasks && inspection.scheduledTasks)
        return 'quitActiveAndScheduledTasks';
    if (inspection.activeTasks)
        return 'quitActiveTasks';
    if (inspection.scheduledTasks)
        return 'quitScheduledTasks';
    return undefined;
}
/** One quit decision at a time; repeated quit requests join the open confirmation instead of stacking. */
export class DesktopQuitConfirmation {
    options;
    pending;
    disposed = false;
    /** @param options - Locale, inspection, and native dialog collaborators. */
    constructor(options) {
        this.options = options;
    }
    /**
     * Decide whether the quit may proceed. The inspection runs once per decision; work that starts or ends
     * while the confirmation is open does not change its copy, and approval never re-inspects.
     * @returns true to quit now, false when the user cancelled.
     */
    confirm() {
        if (this.disposed)
            return Promise.resolve(false);
        if (this.pending !== undefined) {
            this.options.focus();
            return this.pending;
        }
        const pending = this.decide().finally(() => { if (this.pending === pending)
            this.pending = undefined; });
        this.pending = pending;
        return pending;
    }
    /**
     * The application is quitting through a path that does not ask: a pending decision resolves to
     * false without opening a box, and later requests do the same. An already open native box has no
     * close API and disappears with the process.
     */
    dispose() { this.disposed = true; }
    async decide() {
        const inspection = this.options.inspect();
        if (inspection === undefined)
            return true;
        const prompt = resolveDesktopQuitPrompt(await inspection.catch((error) => {
            console.warn('desktop quit: task inspection unavailable', error);
            return 'unknown';
        }));
        if (this.disposed)
            return false;
        if (prompt === undefined)
            return true;
        const { messages } = this.options.locale();
        const windows = (this.options.platform ?? process.platform) === 'win32';
        // Button order follows each platform: macOS lays buttons out right-to-left from index 0, so
        // "Quit" sits right of "Cancel"; the Windows task dialog keeps array order, "Quit" left of "Cancel".
        const result = await this.options.show({
            type: windows ? 'none' : 'warning',
            ...(windows && this.options.icon !== undefined ? { icon: this.options.icon } : {}),
            title: messages.aboutProduct,
            message: messages.quitTitle,
            detail: messages[prompt],
            buttons: [messages.quit, messages.cancel],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
        });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- A bypassing quit can dispose while the box is open.
        if (this.disposed)
            return false;
        return result.response === 0;
    }
}
//# sourceMappingURL=quit-confirmation.js.map