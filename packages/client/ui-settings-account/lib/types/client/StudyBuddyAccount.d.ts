import type { HostObservable, InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export interface StudyBuddyIdentity {
    readonly phase: string;
    readonly account?: {
        readonly id: string;
        readonly label: string;
    };
    readonly message?: string;
}
export interface StudyBuddyBridge {
    status(): Promise<StudyBuddyIdentity>;
    logout(): Promise<StudyBuddyIdentity>;
    checkUpdates(): Promise<{
        readonly message: string;
    }>;
    subscribe(listener: (state: StudyBuddyIdentity) => void): () => void;
}
export interface StudyBuddyAccountInjected {
    hooks: {
        studybuddy: HostObservable<StudyBuddyIdentity>;
    };
    logout(): Promise<StudyBuddyIdentity>;
    checkUpdates(): Promise<{
        readonly message: string;
    }>;
}
type AccountProps = InjectFace<StudyBuddyAccountInjected>;
type LauncherProps = AccountProps & PropsRuntime<'settings.launcher'>;
export declare function StudyBuddyAccountMenu({ useStudybuddy, logout, checkUpdates, openSettings, wide, settingsShortcut }: LauncherProps): import("react").JSX.Element;
export declare function StudyBuddyAccountSection({ useStudybuddy, logout, checkUpdates }: AccountProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=StudyBuddyAccount.d.ts.map