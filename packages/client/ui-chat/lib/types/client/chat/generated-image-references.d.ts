import type { ChatConversationViewNode } from '../contract/chat-nodes.ts';
/** Only settled image results owned by this conversation can turn a request ID into media. */
export declare function generatedImageRequests(nodes: readonly ChatConversationViewNode[], sessionId: string): ReadonlySet<string>;
/** Reuse the authenticated media route; unregistered destinations stay ordinary file references. */
export declare function generatedImageUrl(base: string, sessionId: string, path: string, requests: ReadonlySet<string>): string | undefined;
//# sourceMappingURL=generated-image-references.d.ts.map