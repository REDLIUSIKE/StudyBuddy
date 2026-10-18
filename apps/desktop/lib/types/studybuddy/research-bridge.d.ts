import type { HarnessResearchContextV1, NativeBuiltinHostContextV1, OwnedScope } from '@studybuddy/contracts';
import type { PrivateResearchRequest } from './research-types.ts';
import { type ResearchChats } from './research-chat-store.ts';
import type { ResearchSpeechConsumer } from './research-speech.ts';
interface Options {
    userDataRoot: string;
    settlements?(scope: OwnedScope, input: unknown, signal: AbortSignal): Promise<unknown>;
    speech?: ResearchSpeechConsumer;
    isCurrent(scope: OwnedScope): boolean;
    hostContext(scope: OwnedScope): NativeBuiltinHostContextV1;
    command(action: 'scope' | 'bind' | 'tools' | 'invoke' | 'project-close' | 'journal' | 'journal-export' | 'model-catalog' | 'advanced' | 'goal' | 'schedules', data: unknown): Promise<unknown>;
}
/** Durable Session identity is written before private admission so retries cannot create duplicates. */
export declare class ResearchBridge {
    private readonly options;
    private identity;
    private lease;
    private readonly bindings;
    private readonly admittedBindings;
    private readonly exportRoots;
    private scopeReady;
    private chatStore;
    constructor(options: Options);
    private owner;
    private assert;
    /** Resolve an existing admitted project to its persistent native Session.
     * @param scope - Authenticated Main account generation.
     * @param projectId - Existing named project, never a directory supplied by a page.
     * @returns Main-owned native binding. */
    bind(scope: OwnedScope, projectId: string, requestedSessionId?: string): Promise<HarnessResearchContextV1>;
    private project;
    /** Mutate only this owned project's tab list; selections must already belong to its manifest. */
    chats(scope: OwnedScope, projectId: string, operation?: 'list' | 'create' | 'select' | 'close', sessionId?: string): Promise<ResearchChats>;
    /** Admit an existing sandbox file reference without accepting paths supplied as authority. */
    reference(scope: OwnedScope, projectId: string, path: string): Promise<void>;
    private admit;
    /** Read an already admitted binding during private tool setup without re-entering bind. */
    bound(scope: OwnedScope, projectId: string, sessionId: string): HarnessResearchContextV1;
    /** Dispatch a closed child action through the actual native owner.
     * @param scope - Current account generation.
     * @param request - Correlated private action, containing no model route.
     * @param signal - Observer cancellation; an admitted model request is not replayed.
     * @returns Native result or uncertain failure. */
    invoke(scope: OwnedScope, request: PrivateResearchRequest, signal: AbortSignal): Promise<unknown>;
    /** Fence private bindings while leaving original project/session files intact.
     * @returns Completion of native admission revocation. */
    revoke(): Promise<void>;
}
export {};
//# sourceMappingURL=research-bridge.d.ts.map