import { expect, it, vi } from 'vitest'
import { builtinNativeInvoker } from '../src/studybuddy/builtin-native-invoker.ts'
import { BUILTIN_PRIVATE_METHODS, parseBuiltinResult } from '../src/studybuddy/builtin-contracts.ts'
const scope = {accountId: 'owned', generation: 1}
it.each(['prepareBuiltinRequest','getBuiltinRequestStatus'])('rejects retired per-call session capability %s', method => {
 expect(BUILTIN_PRIVATE_METHODS).not.toContain(method)
 expect(() => parseBuiltinResult(method as never, null)).toThrow('NATIVE_OPERATION_DENIED')
})
it('does not refresh login or device authorization to journal a configured Key request', async () => {
 const withSession = vi.fn(async () => { throw Error('login is unavailable') })
 const useSession = vi.fn(), invokeBuiltin = vi.fn(async () => ({requestReceipt: null}))
 const invoke = builtinNativeInvoker({withSession, native: {useSession, invokeBuiltin} as never})
 expect(await invoke(scope, 'prepareBuiltinKeyRequest', [{} as never])).toEqual({requestReceipt: null})
 expect(withSession).not.toHaveBeenCalled(); expect(useSession).not.toHaveBeenCalled()
 expect(invokeBuiltin).toHaveBeenCalledWith(scope, 'prepareBuiltinKeyRequest', [{}])
})
