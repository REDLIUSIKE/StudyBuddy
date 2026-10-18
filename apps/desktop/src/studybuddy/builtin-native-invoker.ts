import type { NativeBuiltinPrivateOperationMap, OwnedScope } from '@studybuddy/contracts'
import type { NativeAccountClient } from './native-account-client.ts'
import type { MainSession } from './services.ts'

/** Keep configuration login outside the configured Key's invocation path. */
export function builtinNativeInvoker(options: {
 withSession<T>(run: (session: MainSession) => Promise<T>): Promise<T>
 native: Pick<NativeAccountClient, 'useSession' | 'invokeBuiltin'>
}) {
 return <K extends keyof NativeBuiltinPrivateOperationMap>(scope: OwnedScope, method: K,
 args: NativeBuiltinPrivateOperationMap[K]['args']): Promise<NativeBuiltinPrivateOperationMap[K]['result']> => {
  if (method === 'prepareBuiltinKeyRequest') return options.native.invokeBuiltin(scope, method, args)
  return options.withSession(async session => {
   if (session.scope.accountId !== scope.accountId || session.scope.generation !== scope.generation) throw Error('BUILTIN_SCOPE_REVOKED')
   options.native.useSession(session)
   return options.native.invokeBuiltin(scope, method, args)
  })
 }
}
