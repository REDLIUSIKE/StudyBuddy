import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { NativeBuiltinHostContextV1 } from '@studybuddy/contracts';
import type { CapabilityContext } from './types.ts';
/** Only a live native execution can establish a capability caller. */
export declare function capabilityContext(ctx: Context, owner: NativeBuiltinHostContextV1, exec: {
    agent?: Agent | undefined;
    callId: string;
    signal: AbortSignal;
}): CapabilityContext;
//# sourceMappingURL=context.d.ts.map