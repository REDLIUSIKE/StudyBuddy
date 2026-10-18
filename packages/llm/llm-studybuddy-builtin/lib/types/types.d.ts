/** Durable secret-free request authority frozen at actual trusted conversation dispatch. */
import type { NativeBuiltinRequestFreezeV1 } from '@studybuddy/contracts';
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /** Exact built-in source, grant, model and funding authority recorded before provider dispatch.
         * Contains no credential or request ticket. */
        'studybuddy/builtin-request': NativeBuiltinRequestFreezeV1;
    }
}
//# sourceMappingURL=types.d.ts.map