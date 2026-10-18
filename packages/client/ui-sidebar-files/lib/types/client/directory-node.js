/** One open directory and its active child nodes; cached view preferences live in the store. */
export class DirectoryNode {
    path;
    load;
    watch;
    failed;
    restore;
    /** Open direct-child directories, keyed by absolute path. */
    children = new Map();
    controller = new AbortController();
    signal;
    task;
    reading;
    dirty = false;
    initialized = false;
    automatic = true;
    constructor(path, load, watch, failed, lifetime, restore = []) {
        this.path = path;
        this.load = load;
        this.watch = watch;
        this.failed = failed;
        this.restore = restore;
        this.signal = AbortSignal.any([lifetime, this.controller.signal]);
    }
    /**
     * Start observation once; readiness triggers the initial listing.
     * @returns this node.
     */
    open() {
        this.task ??= this.follow();
        return this;
    }
    /**
     * Find an active node in this subtree.
     * @param path - absolute directory path.
     * @returns the matching node, or undefined when that directory is closed.
     */
    find(path) {
        if (path === this.path)
            return this;
        for (const child of this.children.values()) {
            const found = child.find(path);
            if (found !== undefined)
                return found;
        }
        return undefined;
    }
    /**
     * Update the expansion preferences used by pending directory listings.
     * @param expanded - latest expansion preferences from the store.
     */
    setExpanded(expanded) {
        this.restore = expanded;
        for (const child of this.children.values())
            child.setExpanded(expanded);
    }
    /**
     * Open a direct child using this node's lifetime and automatic-refresh setting.
     * @param path - absolute direct-child directory path.
     * @param restore - descendant expansion preferences to restore after listing.
     * @returns the active child, or undefined after cancellation.
     */
    expand(path, restore = []) {
        if (this.signal.aborted)
            return undefined;
        let child = this.children.get(path);
        if (child === undefined) {
            child = new DirectoryNode(path, this.load, this.watch, this.failed, this.signal, restore);
            child.automatic = this.automatic;
            this.children.set(path, child);
        }
        return child.open();
    }
    /**
     * Remove a child and its pending restoration preferences.
     * @param path - absolute direct-child directory path.
     * @returns once the child subtree's reads and watches have ended.
     */
    async collapse(path) {
        this.restore = this.restore.filter(value => value !== path && !value.startsWith(`${path}/`));
        const child = this.children.get(path);
        this.children.delete(path);
        await child?.close();
    }
    /**
     * Control subtree rereads without ending subscriptions.
     * @param enabled - refresh dirty nodes automatically.
     */
    setAutomatic(enabled) {
        this.automatic = enabled;
        if (enabled && this.dirty)
            void this.refresh();
        for (const child of this.children.values())
            child.setAutomatic(enabled);
    }
    /** Queue a reread, coalescing with active work. @returns completion of the active read and its coalesced rereads. */
    refresh() {
        this.dirty = true;
        this.reading ??= this.read();
        return this.reading;
    }
    /** Refresh this node and its open descendants. @returns once their listings settle. */
    async refreshTree() {
        await this.refresh();
        await Promise.all([...this.children.values()].map(child => child.refreshTree()));
    }
    /** Cancel the active subtree. @returns once all owned reads and watches have ended. */
    async close() {
        this.controller.abort();
        await Promise.all([this.task, this.reading, ...[...this.children.values()].map(child => child.close())]);
        this.children.clear();
    }
    async follow() {
        try {
            for await (const _event of this.watch(this.path, this.signal)) {
                this.dirty = true;
                if (!this.initialized || this.automatic)
                    void this.refresh();
            }
        }
        catch (error) {
            if (!this.signal.aborted) {
                if (!this.initialized)
                    await this.refresh();
                if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'workspace-file/watch-unsupported')) {
                    this.failed(this.path, error);
                }
            }
        }
    }
    async read() {
        const readAgain = () => this.dirty && this.automatic && !this.signal.aborted;
        try {
            do {
                this.dirty = false;
                const level = await this.load(this.path, this.signal);
                if (this.signal.aborted || level === undefined)
                    return;
                this.initialized = true;
                const directories = new Set(level.entries.filter(entry => entry.type === 'directory')
                    .map(entry => `${this.path.replace(/[/\\]+$/, '')}/${entry.name}`));
                for (const path of this.children.keys()) {
                    if (!directories.has(path))
                        await this.collapse(path);
                }
                for (const path of directories) {
                    if (this.restore.includes(path))
                        this.expand(path, this.restore);
                }
                this.restore = [];
            } while (readAgain());
        }
        finally {
            this.reading = undefined;
        }
    }
}
//# sourceMappingURL=directory-node.js.map