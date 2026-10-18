import type { Inbox } from '@deepseek-ai/dsh-agent';
/**
 * Create a mutable in-memory Inbox stub for tests that exercise only the public
 * queue operations. Durable events, projection validation, and live Inbox
 * notifications require a real Agent created by the AgentLoop test harness.
 * @returns an Inbox backed by two process-local arrays.
 */
export declare function createInboxStub(): Inbox;
/**
 * Create an unsupported Inbox placeholder for Agent stubs whose tests do not exercise Inbox behavior.
 * @returns an Inbox whose pending lists are empty and whose mutation methods throw.
 */
export declare function unsupportedInbox(): Inbox;
//# sourceMappingURL=inbox.d.ts.map