var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
/** Host-side response comparison for pinned model files on Hugging Face-compatible origins. */
import { deadline } from '@deepseek-ai/dsh-timeout';
/**
 * Prefer the first successful HEAD response while retaining other sources for download fallback.
 * All probes settle before returning; if every probe fails, the configured order is preserved.
 * @param assetUrl - revision-pinned upstream file URL.
 * @param origins - nonempty configured origins, or one explicit deployment origin.
 * @param timeoutMs - maximum probe duration, including redirects.
 * @param signal - preparation cancellation or deadline.
 * @returns deduplicated download URLs with the first responding source first; a single source needs no probe.
 */
export async function orderModelSources(assetUrl, origins, timeoutMs, signal) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        signal.throwIfAborted();
        const path = new URL(assetUrl).pathname;
        const urls = [...new Set(origins.map(origin => new URL(path, origin).href))];
        if (urls.length === 1)
            return urls;
        const finished = new AbortController();
        const timeout = __addDisposableResource(env_1, deadline(signal, timeoutMs, 'SPEECH_SOURCE_PROBE_TIMEOUT'), false);
        const probing = AbortSignal.any([timeout.signal, finished.signal]);
        const requests = urls.map(async (url) => ({ url, response: await fetch(url, { method: 'HEAD', signal: probing }) }));
        let preferred;
        try {
            preferred = await Promise.any(requests.map(async (request) => {
                const { url, response } = await request;
                if (!response.ok)
                    throw new Error(`Model source probe returned HTTP ${response.status}`);
                return url;
            }));
        }
        catch (_unavailableSources) {
            // Downloads can still work when an origin refuses HEAD or exceeds the probe deadline.
        }
        finally {
            finished.abort();
            const settled = await Promise.allSettled(requests);
            await Promise.allSettled(settled.map(async (result) => {
                if (result.status === 'fulfilled')
                    await result.value.response.body?.cancel();
            }));
        }
        signal.throwIfAborted();
        return preferred === undefined ? urls : [preferred, ...urls.filter(url => url !== preferred)];
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        __disposeResources(env_1);
    }
}
//# sourceMappingURL=model-sources.js.map