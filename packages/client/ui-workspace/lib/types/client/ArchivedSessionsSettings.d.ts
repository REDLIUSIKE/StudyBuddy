import type { GlobalStandardProps, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** Metadata hooks do not acquire or open archived Session generations. */
export type ArchivedSessionsSettingsProps = Pick<GlobalStandardProps, 'useSessions' | 'useWorkspaces'> & PropsLocale<'workspace'> & {
    unarchiveSession: (sessionId: SessionId) => Promise<void>;
};
/** Show the complete archive set, including cold rows whose display metadata is not yet available. */
export declare function ArchivedSessionsSettings({ useSessions, useWorkspaces, unarchiveSession, t }: ArchivedSessionsSettingsProps): import("react").JSX.Element;
//# sourceMappingURL=ArchivedSessionsSettings.d.ts.map