import type { NativeBuiltinPrivateOperationMap, OwnedScope } from '@studybuddy/contracts';
import type { NativeAccountClient } from './native-account-client.ts';
import type { MainSession } from './services.ts';
/** Keep configuration login outside the configured Key's invocation path. */
export declare function builtinNativeInvoker(options: {
    withSession<T>(run: (session: MainSession) => Promise<T>): Promise<T>;
    native: Pick<NativeAccountClient, 'useSession' | 'invokeBuiltin'>;
}): <K extends keyof NativeBuiltinPrivateOperationMap>(scope: OwnedScope, method: K, args: NativeBuiltinPrivateOperationMap[K]["args"]) => Promise<NativeBuiltinPrivateOperationMap[K]["result"]>;
//# sourceMappingURL=builtin-native-invoker.d.ts.map