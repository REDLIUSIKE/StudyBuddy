import { cancelledFailure, carrierFailure } from '@deepseek-ai/dsh-api-gateway/client';
/** The assembly row the proxies stand in for; its generated clients exist only in built `lib/`. */
export const REMOTES_PACKAGE = '@deepseek-ai/dsh-api-remotes';
const PREFIX = 'remote.';
/**
 * Namespaces to provide: every `remote.<ns>` a roster module injects, plus the
 * namespace of every endpoint the mock has a rule for.
 * @param modules - loaded roster modules.
 * @param mock - the spec's mock.
 * @returns sorted namespace names.
 */
export function remoteNamespacesOf(modules, mock) {
    const names = new Set();
    for (const module of modules) {
        for (const service of injectNames(module.inject))
            if (service.startsWith(PREFIX))
                names.add(service.slice(PREFIX.length));
    }
    for (const endpoint of mock.endpoints()) {
        const slash = endpoint.indexOf('/');
        if (slash > 0 && !endpoint.startsWith('$'))
            names.add(endpoint.slice(0, slash));
    }
    return [...names].sort();
}
function injectNames(inject) {
    if (inject === undefined)
        return [];
    if (Array.isArray(inject))
        return inject;
    return Object.keys(inject);
}
/**
 * Plugin providing the namespace proxies; `TestClient.start` mounts it before the Loader rows.
 * @param namespaces - namespaces to provide.
 * @param mock - the spec's mock, asked for each endpoint's mode.
 * @returns the plugin.
 */
export function remoteProxiesPlugin(namespaces, mock) {
    return {
        inject: ['connection'],
        apply(ctx) {
            const connection = ctx.get('connection');
            for (const namespace of namespaces)
                ctx.provide(`${PREFIX}${namespace}`, namespaceProxy(namespace, connection, mock));
        },
    };
}
function namespaceProxy(namespace, connection, mock) {
    return new Proxy(Object.create(null), {
        get: (_target, property) => {
            // No `then`: awaiting the namespace object itself must not call a method.
            if (typeof property !== 'string' || property === 'then')
                return undefined;
            return (...values) => {
                const endpoint = `${namespace}/${property}`;
                const args = [...values];
                const signal = args.at(-1) instanceof AbortSignal ? args.pop() : undefined;
                if (mock.modeOf(endpoint) === 'stream') {
                    const open = connection.rpc.open;
                    /* v8 ignore next -- the mock transport always supplies openStream, so the Connection carrier exposes open. */
                    if (open === undefined)
                        throw new Error(`client-test-runtime: ${endpoint} is a stream but the carrier has no in-process opener`);
                    return open('/api', endpoint, { args }, signal ?? new AbortController().signal);
                }
                return connection.rpc.call('/api', endpoint, { args }, signal).catch((error) => (signal?.aborted === true ? cancelledFailure(endpoint, error) : carrierFailure(endpoint, error)));
            };
        },
    });
}
//# sourceMappingURL=remote-proxies.js.map