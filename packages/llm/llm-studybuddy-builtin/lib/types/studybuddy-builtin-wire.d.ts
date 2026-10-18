/** Exact native authority projected onto the existing pi-ai wire adapter. */
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import type { NativeBuiltinPreparedRouteV1 } from '@studybuddy/contracts';
import type { BuiltinResponseFacts } from './studybuddy-builtin-terminal.ts';
import type { PiAiAdapterOptions } from '@deepseek-ai/dsh-llm-pi-ai';
/** Construct an adapter containing only one private exact route, without ambient auth or discovery.
 * @param route - Private native material, retained only by the prepared request.
 * @param headers - Protected per-request admission ticket headers.
 * @param observation - Optional raw terminal observation and explicit transport or attachment resolvers.
 * @returns The shipped pi-ai adapter with fully explicit model capabilities. */
export declare function createBuiltinWireAdapter(route: NativeBuiltinPreparedRouteV1, headers: Readonly<Record<string, string>>, observation?: {
    readonly facts?: BuiltinResponseFacts;
    readonly purpose?: 'validation' | 'diagnostic';
    readonly fetch?: typeof fetch;
    readonly resolveAttachments?: PiAiAdapterOptions['resolveAttachments'];
    readonly resolveImageAccess?: PiAiAdapterOptions['resolveImageAccess'];
}): PiAiAdapter;
//# sourceMappingURL=studybuddy-builtin-wire.d.ts.map