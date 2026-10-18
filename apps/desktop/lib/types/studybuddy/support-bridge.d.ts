import { type HarnessSupportEvent, type HarnessSupportMethod, type HarnessSupportOperationMap, type OwnedScope } from '@studybuddy/contracts';
import type { MainSession } from './services.ts';
import type { SupportDiagnostics } from './support-diagnostics.ts';
/** Electron supplies these sender facts, never renderer JSON. */
export interface SupportSender {
    id: number;
    mainFrame: boolean;
    url: string;
}
type Handler = (sender: SupportSender, args: readonly unknown[]) => Promise<unknown>;
/** Native and IPC dependencies owned by the current authenticated main process. */
export interface SupportBridgeDependencies {
    readScope(): OwnedScope | undefined;
    withSession<T>(run: (session: MainSession) => Promise<T>): Promise<T>;
    isTrustedSender(sender: SupportSender): boolean;
    register(channel: string, handler: Handler): () => void;
    emit(sender: SupportSender, channel: string, payload: unknown): void;
    pickScreenshots(sender: SupportSender): Promise<readonly string[]>;
    native: {
        useSession(session: MainSession): void;
        invokeSupport(scope: OwnedScope, method: HarnessSupportMethod, args: HarnessSupportOperationMap[HarnessSupportMethod]['args']): Promise<unknown>;
        subscribeSupportEvents(scope: OwnedScope, listener: (event: HarnessSupportEvent) => void): () => void;
    };
    diagnostics: SupportDiagnostics;
}
/** Install narrow handlers and revoke account-owned progress/results on session loss.
 * @param deps Trusted main/session services, the original companion and the native picker.
 * @returns Explicit owner invalidation and full IPC disposal.
 */
export declare function installSupportBridge(deps: SupportBridgeDependencies): {
    revoke(): void;
    dispose(): void;
};
export {};
//# sourceMappingURL=support-bridge.d.ts.map