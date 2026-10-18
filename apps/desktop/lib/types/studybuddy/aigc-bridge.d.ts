import type { HarnessAigcContextV1, NativeBuiltinHostContextV1, OwnedScope, HarnessAigcToolInvocationV1, HarnessCapabilityCallerV1 } from '@studybuddy/contracts';
import type { AigcLegacySource, AigcChats } from './aigc-chat-store.ts';
interface Options {
    userDataRoot: string;
    isCurrent(scope: OwnedScope): boolean;
    hostContext(scope: OwnedScope): NativeBuiltinHostContextV1;
    command(action: 'scope' | 'bind' | 'tools' | 'project-close' | 'native' | 'cancel-native' | 'chat-title' | 'project-title' | 'submit' | 'records', data: unknown, signal?: AbortSignal): Promise<unknown>;
    nativeModel?(scope: OwnedScope, providerId: string, modelId: string): Promise<{
        provider: string;
        model: string;
        capabilityFlags: readonly string[];
    }>;
    budget?(caller: HarnessCapabilityCallerV1, input: {
        requestId: string;
        modelId: string;
        fundingSource: 'platform' | 'user_api';
    }, signal: AbortSignal): Promise<unknown>;
    releaseCaller?(scope: OwnedScope, grantRef: string): Promise<void>;
}
interface Binding {
    root: string;
    context: HarnessAigcContextV1;
}
export declare class AigcBridge {
    private readonly options;
    private identity;
    private lease;
    private store;
    private ready;
    private readonly admitted;
    private readonly pending;
    private readonly mounted;
    private readonly callers;
    private readonly temporary;
    private readonly capabilityCallers;
    private helperRoot;
    private questionPresenter?;
    constructor(options: Options);
    setQuestionPresenter(presenter: (context: HarnessAigcContextV1, signal: AbortSignal, cancel: () => void) => Promise<() => void>): void;
    private owner;
    private assert;
    project(scope: OwnedScope, directory: string): Promise<string>;
    chats(scope: OwnedScope, directory: string, operation?: 'list' | 'create' | 'select' | 'close', sessionId?: string, legacy?: AigcLegacySource): Promise<AigcChats>;
    bind(scope: OwnedScope, directory: string, sessionId?: string, mountTools?: boolean): Promise<HarnessAigcContextV1>;
    bound(scope: OwnedScope, value: HarnessAigcContextV1): Binding;
    isEditorOwner(caller: HarnessCapabilityCallerV1, projectRef: string): boolean;
    restoreSource(caller: HarnessCapabilityCallerV1, directory: string): Promise<boolean>;
    tool(request: HarnessAigcToolInvocationV1, invoke: (scope: OwnedScope, input: unknown, signal: AbortSignal) => Promise<unknown>, signal: AbortSignal): Promise<unknown>;
    retainCapabilityCaller(caller: HarnessCapabilityCallerV1, context: HarnessAigcContextV1): {
        origin: {
            sessionId: string;
            callId: string;
            directory: string;
            grantRef: string;
        };
        release: () => Promise<void>;
    };
    private capabilitySource;
    budget(scope: OwnedScope, value: unknown, signal: AbortSignal): Promise<unknown>;
    invokeCapability(caller: HarnessCapabilityCallerV1, context: HarnessAigcContextV1, operation: HarnessAigcToolInvocationV1['operation'], input: unknown, invoke: (scope: OwnedScope, input: unknown, signal: AbortSignal) => Promise<unknown>, signal: AbortSignal): Promise<unknown>;
    private invokeNative;
    question(scope: OwnedScope, input: unknown, signal: AbortSignal): Promise<unknown>;
    temporaryCommand(scope: OwnedScope, value: unknown, signal: AbortSignal): Promise<unknown>;
    archive(scope: OwnedScope, directory: string, file?: string, continueChat?: boolean): Promise<unknown>;
    rename(scope: OwnedScope, directory: string, sessionId: string, name: string): Promise<AigcChats>;
    projectTitle(scope: OwnedScope, directory: string, name: string): Promise<unknown>;
    submit(scope: OwnedScope, value: unknown): Promise<unknown>;
    records(scope: OwnedScope, directory: string, sessionId: string): Promise<unknown>;
    revoke(): Promise<void>;
}
export {};
//# sourceMappingURL=aigc-bridge.d.ts.map