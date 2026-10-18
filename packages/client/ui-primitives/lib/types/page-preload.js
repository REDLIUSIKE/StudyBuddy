/** One idle queue per renderer: first screen first, then bounded, spaced preparation. */
export class PagePreloader {
    #pending = [];
    #timer;
    #idle;
    #running = false;
    #started = false;
    register(tasks) {
        if (typeof window === 'undefined' || !tasks.length)
            return () => { };
        const owner = new AbortController();
        this.#pending.push(...tasks.map(task => ({ owner, task })));
        this.schedule(this.#started ? 350 : 1200);
        return () => {
            owner.abort();
            this.#pending = this.#pending.filter(page => page.owner !== owner);
            if (!this.#pending.length)
                this.clearScheduled();
        };
    }
    clearScheduled() {
        if (this.#timer !== undefined)
            clearTimeout(this.#timer);
        if (this.#idle !== undefined)
            window.cancelIdleCallback?.(this.#idle);
        this.#timer = undefined;
        this.#idle = undefined;
    }
    schedule(delay) {
        if (this.#running || this.#timer !== undefined || this.#idle !== undefined || !this.#pending.length)
            return;
        this.#timer = setTimeout(() => {
            this.#timer = undefined;
            if (!this.#pending.length)
                return;
            if (!document.hidden && window.requestIdleCallback) {
                let idle;
                const start = () => {
                    if (this.#idle !== idle)
                        return;
                    this.clearScheduled();
                    void this.run();
                };
                this.#idle = idle = window.requestIdleCallback(start, { timeout: 2000 });
                this.#timer = setTimeout(start, 2000);
            }
            else
                void this.run();
        }, delay);
    }
    async run() {
        if (this.#running || !this.#pending.length)
            return;
        this.#pending.sort((a, b) => a.task.priority - b.task.priority);
        const page = this.#pending.shift();
        if (page.owner.signal.aborted) {
            this.schedule(350);
            return;
        }
        this.#running = true;
        this.#started = true;
        const started = performance.now();
        let timeout, abort;
        let status = 'ready';
        try {
            await Promise.race([
                Promise.resolve().then(() => page.owner.signal.aborted ? undefined : page.task.prepare()),
                new Promise((resolve, reject) => {
                    timeout = setTimeout(() => reject(new Error('PAGE_PRELOAD_TIMEOUT')), 30000);
                    abort = () => resolve();
                    page.owner.signal.addEventListener('abort', abort, { once: true });
                }),
            ]);
            if (page.owner.signal.aborted)
                status = 'cancelled';
        }
        catch {
            status = 'failed';
        }
        finally {
            if (timeout !== undefined)
                clearTimeout(timeout);
            if (abort)
                page.owner.signal.removeEventListener('abort', abort);
            try {
                performance.measure('studybuddy.preload.' + page.task.id, { start: started, end: performance.now(), detail: { status } });
            }
            catch { /* telemetry does not own page readiness */ }
            this.#running = false;
            this.schedule(350);
        }
    }
}
const pages = new PagePreloader();
/** Register fixed pages for the current scope; cancel on scope replacement and plugin disposal. */
export const preloadPages = (tasks) => pages.register(tasks);
//# sourceMappingURL=page-preload.js.map