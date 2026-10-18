/**
 * Cache accessed namespaces and expose the current native mock for each method.
 * @param method - selects a stable endpoint mock for its configured invocation mode.
 * @returns enumerable accessed namespaces and methods; symbols and thenable probes remain inert.
 */
export function createRemoteProxy(method) {
    return new Proxy(Object.create(null), {
        get(namespaces, namespace) {
            if (typeof namespace !== 'string' || namespace === 'then')
                return undefined;
            return namespaces[namespace] ??= new Proxy(Object.create(null), {
                get(methods, name) {
                    if (typeof name !== 'string' || name === 'then')
                        return undefined;
                    return methods[name] = method(`${namespace}/${name}`);
                },
            });
        },
    });
}
//# sourceMappingURL=remote-proxy.js.map