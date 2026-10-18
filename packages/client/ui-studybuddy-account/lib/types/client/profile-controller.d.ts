/** One ephemeral browser lease per login; late acquisitions are always released. */
import type { EmbeddedLease, EmbeddedTheme, OwnedScope } from '@studybuddy/contracts';
import type { AccountHost } from './business-api.ts';
import { ObservableState } from './observable.ts';
export interface ProfileSnapshot {
    scope: OwnedScope | null;
    lease: EmbeddedLease | null;
    busy: boolean;
    errorCode: string | null;
}
export declare class ProfileController extends ObservableState<ProfileSnapshot> {
    #private;
    private readonly api;
    private readonly target;
    constructor(api: NonNullable<AccountHost['embedded']> | undefined, target?: 'personal_profile' | 'model_insights');
    setScope(scope: OwnedScope | null): void;
    acquire: () => Promise<void>;
    setTheme: (theme: EmbeddedTheme) => Promise<void>;
    reportFailure: (code: string) => void;
    retry: () => Promise<void>;
    dispose(): void;
}
//# sourceMappingURL=profile-controller.d.ts.map