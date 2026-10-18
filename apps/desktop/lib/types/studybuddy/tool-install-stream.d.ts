/** Subscribe before snapshots. Keep durable journal facts separate from transport sequence. */
import type { ActiveInstallView, InstallEventView, OwnedScope } from '@studybuddy/contracts';
import type { NativeAccountClient } from './native-account-client.ts';
type Native = Pick<NativeAccountClient, 'invoke' | 'subscribeInstallEvents' | 'subscribeInstallStream'>;
/** Snapshots remain InstallRunView, never fabricated InstallEventView progress. */
export declare class ToolInstallStream {
    private readonly native;
    private readonly snapshot;
    private readonly attachments;
    private readonly revoked;
    constructor(native: Native, snapshot?: (scope: OwnedScope, active: ActiveInstallView | null) => void);
    attach(scope: OwnedScope, listener: (event: InstallEventView) => void): Promise<() => void>;
    revoke(scope: OwnedScope): void;
}
export {};
//# sourceMappingURL=tool-install-stream.d.ts.map