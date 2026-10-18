/** One-shot MessagePorts carry browser operations and their results. */
import { MessagePort } from 'node:worker_threads';
import type { Worker } from 'node:worker_threads';
import { z } from 'zod';
/** Transferable reply channel paired with a validated operation payload. */
export declare const requestSchema: z.ZodObject<{
    method: z.ZodString;
    args: z.ZodUnknown;
    reply: z.ZodCustom<MessagePort, MessagePort>;
}, z.core.$strict>;
/**
 * Send one request and release its reply port after response or peer shutdown.
 * @param target - owning Worker or parent port.
 * @param method - operation understood by the receiver.
 * @param args - structured-cloneable request data.
 * @param signal - owning Worker lifetime, when observed by the caller.
 * @returns the receiver's value, rejecting malformed responses and peer shutdown.
 */
export declare function request(target: MessagePort | Worker, method: string, args?: unknown, signal?: AbortSignal): Promise<unknown>;
/**
 * Validate and answer one request without leaving rejected callbacks unobserved.
 * @param raw - untrusted message received from the Worker boundary.
 * @param execute - owner that validates and executes the method arguments.
 * @returns after the response has been posted and the reply port released.
 */
export declare function answer(raw: unknown, execute: (method: string, args: unknown) => Promise<unknown>): Promise<void>;
//# sourceMappingURL=worker-rpc.d.ts.map