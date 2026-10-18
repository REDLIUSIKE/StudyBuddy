/** Poll only the current account, retry independent authorities, and await owned work on shutdown. */
export class ModelCatalogSync {
    deps;
    stopped = true;
    cancel;
    pending = Promise.resolve();
    constructor(deps) {
        this.deps = deps;
    }
    /** Start tools immediately; startup can retain ownership of the first platform setup. */
    start(options = {}) {
        if (!this.stopped)
            return;
        this.stopped = false;
        this.arm(0, options.platformAlreadyLoading === true);
    }
    arm(delay, skipPlatform = false) {
        if (this.stopped)
            return;
        this.cancel = this.deps.schedule(() => {
            this.cancel = undefined;
            this.pending = this.refresh(skipPlatform).finally(() => { this.arm(60_000); });
        }, delay);
    }
    current(scope) {
        const current = this.deps.scope();
        return !this.stopped && current?.accountId === scope.accountId && current.generation === scope.generation;
    }
    async refresh(skipPlatform = false) {
        const scope = this.deps.scope();
        if (!scope || !this.current(scope))
            return;
        await Promise.all([
            (async () => { if (skipPlatform)
                return; try {
                await this.deps.platform(scope);
            }
            catch {
                if (this.current(scope))
                    this.deps.failed('platform');
            } })(),
            (async () => {
                try {
                    const result = await this.deps.tools(scope);
                    if (this.current(scope) && result.records.some(row => row.state === 'updated' || row.state === 'prepared'))
                        this.deps.changed(scope);
                }
                catch {
                    if (this.current(scope))
                        this.deps.failed('tools');
                }
            })(),
        ]);
    }
    /** Cancel future work and wait for the current account-fenced refresh to settle. */
    async dispose() { this.stopped = true; this.cancel?.(); this.cancel = undefined; await this.pending; }
}
//# sourceMappingURL=model-catalog-sync.js.map