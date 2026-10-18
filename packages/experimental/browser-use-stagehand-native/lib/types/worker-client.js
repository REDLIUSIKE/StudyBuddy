/** Isolated Stagehand Workers own CDP connections; the host owns browser processes. */
import { Worker } from 'node:worker_threads';
import { StagehandDrainError } from "./native.js";
import { request } from "./worker-rpc.js";
/**
 * Connect Stagehand through an isolated Worker that receives no ambient environment.
 * @param config - resolved CDP connection and operation options.
 * @param signal - cancellation of lazy browser acquisition.
 * @param warn - report SDK cleanup failures after connection termination.
 * @returns a runtime whose close requires SDK request drainage before releasing ownership.
 */
export async function openBrowserWorker(config, signal, warn) {
    signal.throwIfAborted();
    const entry = new URL('./worker.js', import.meta.url);
    // Only explicit model credentials cross in workerData; ambient credentials and proxy settings stay outside.
    const env = {};
    if (process.env.TSX_TSCONFIG_PATH !== undefined)
        env.TSX_TSCONFIG_PATH = process.env.TSX_TSCONFIG_PATH;
    let worker;
    /* v8 ignore next 3 -- native.e2e.ts starts the bundled Worker through a plain-Node provider fixture. */
    if (!import.meta.url.endsWith('.ts')) {
        worker = new Worker(entry, { workerData: config, execArgv: [], env });
    }
    else {
        const source = new URL('./worker.ts', import.meta.url);
        const bootstrap = `import { register } from ${JSON.stringify(import.meta.resolve('tsx/esm/api'))}; register(); await import(${JSON.stringify(source.href)})`;
        worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`), { workerData: config, execArgv: [], env });
    }
    let termination;
    const terminate = () => termination ??= worker.terminate();
    const lifetime = new AbortController();
    worker.once('error', (error) => { lifetime.abort(error); });
    worker.once('exit', (code) => { lifetime.abort(new Error(`Stagehand browser Worker exited (${code})`)); });
    let closing;
    const close = () => closing ??= (async () => {
        let timeout;
        try {
            await Promise.race([
                request(worker, 'close', undefined, lifetime.signal),
                new Promise((_resolve, reject) => {
                    timeout = setTimeout(() => { reject(new Error('Stagehand connection cleanup timed out')); }, config.shutdownGraceMs);
                }),
            ]);
        }
        catch (error) {
            warn(`Stagehand SDK cleanup did not finish: ${String(error)}`);
            throw new StagehandDrainError(`Stagehand SDK requests did not drain: ${String(error)}`, { cause: error });
        }
        finally {
            clearTimeout(timeout);
            await terminate();
            worker.removeAllListeners();
        }
    })();
    const abortOpening = () => { void terminate(); };
    signal.addEventListener('abort', abortOpening, { once: true });
    try {
        await request(worker, 'ready', undefined, lifetime.signal);
        signal.throwIfAborted();
        lifetime.signal.throwIfAborted();
    }
    catch (error) {
        const failure = lifetime.signal.reason ?? error;
        await terminate();
        signal.throwIfAborted();
        throw failure;
    }
    finally {
        signal.removeEventListener('abort', abortOpening);
    }
    return {
        async execute(method, args, signal) {
            signal?.throwIfAborted();
            lifetime.signal.throwIfAborted();
            if (closing !== undefined)
                throw new Error('Stagehand browser Worker is closed');
            const canceled = () => { void close().catch((error) => { lifetime.abort(error); }); };
            signal?.addEventListener('abort', canceled, { once: true });
            try {
                const result = await request(worker, method, args, lifetime.signal);
                signal?.throwIfAborted();
                return result;
            }
            catch (error) {
                signal?.throwIfAborted();
                throw error;
            }
            finally {
                signal?.removeEventListener('abort', canceled);
            }
        },
        close,
    };
}
//# sourceMappingURL=worker-client.js.map