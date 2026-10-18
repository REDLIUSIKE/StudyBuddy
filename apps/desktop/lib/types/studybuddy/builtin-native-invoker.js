/** Keep configuration login outside the configured Key's invocation path. */
export function builtinNativeInvoker(options) {
    return (scope, method, args) => {
        if (method === 'prepareBuiltinKeyRequest')
            return options.native.invokeBuiltin(scope, method, args);
        return options.withSession(async (session) => {
            if (session.scope.accountId !== scope.accountId || session.scope.generation !== scope.generation)
                throw Error('BUILTIN_SCOPE_REVOKED');
            options.native.useSession(session);
            return options.native.invokeBuiltin(scope, method, args);
        });
    };
}
//# sourceMappingURL=builtin-native-invoker.js.map