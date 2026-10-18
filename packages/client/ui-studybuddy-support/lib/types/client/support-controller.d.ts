import type { HarnessSupportApi, HarnessSupportIssueInput, HarnessSupportOperationView, HarnessSupportPreviewReceipt, HarnessSupportScreenshot, OwnedScope, SupportLogRange } from '@studybuddy/contracts';
/** Minimal desktop API used by this feature; no credentials or files enter this interface. */
export interface SupportHost {
    support?: HarnessSupportApi;
    status(): Promise<{
        phase: string;
        scope?: OwnedScope | null;
    }>;
    subscribe(listener: (state: {
        phase: string;
        scope?: OwnedScope | null;
    }) => void): () => void;
    checkUpdates(): Promise<{
        phase: string;
        message: string;
    }>;
}
interface Snapshot {
    scope: OwnedScope | null;
    available: boolean;
    busy: boolean;
    previewBusy: boolean;
    preview: HarnessSupportPreviewReceipt | null;
    operation: HarnessSupportOperationView;
    screenshots: readonly HarnessSupportScreenshot[];
    errorCode: string | null;
    copied: string | null;
    update: string | null;
    issueUnconfirmed: boolean;
}
/** Account-owned observable and command owner; closing its Settings presentation does not restart requests. */
export declare class SupportController {
    #private;
    private readonly host;
    constructor(host: SupportHost | undefined);
    getSnapshot: () => Snapshot;
    subscribe: (listener: () => void) => (() => void);
    /** Bind the registration's declared view-store reset, not a second business store. */
    bindDraftReset(reset: () => void): void;
    /** Replace the account generation and clear every previous draft, selection and result. */
    setScope(scope: OwnedScope | null): void;
    /** Explicit preview does not create a log upload or a problem report. */
    preview: (range: SupportLogRange) => Promise<void>;
    /** Upload selected logs only; a failed frozen native attempt keeps its workflow id. */
    uploadLogs: (range: SupportLogRange) => Promise<void>;
    /** Submit once; a report with an uncertain creation receipt is never automatically repeated. */
    submitIssue: (input: Omit<HarnessSupportIssueInput, "screenshotSelectionIds">) => Promise<void>;
    /** Select optional screenshots through Main's picker and the existing native registry. */
    selectScreenshots: () => Promise<void>;
    /** Copy only a server-confirmed reference from the current operation. */
    copyReference: (reference: string) => Promise<void>;
    /** Reuse the existing StudyBuddy update check without opening an installer. */
    checkUpdates: () => Promise<void>;
    /** Plugin teardown removes subscriptions; it does not promise deletion of a remote upload. */
    dispose(): void;
}
export {};
//# sourceMappingURL=support-controller.d.ts.map