/** The UI receives fixed methods; neither login tokens nor endpoint selection enter this adapter. */
import type { StudyBuddyBusinessApi, BusinessOperationMap, EmbeddedLease, EmbeddedTheme, OwnedScope, ToolNavigationNotice } from '@studybuddy/contracts';
/** Fixed renderer preload methods; private consumer material is excluded. */
export interface AccountHost {
    status(): Promise<{
        phase: string;
        scope?: OwnedScope | null;
    }>;
    subscribe(listener: (state: {
        phase: string;
        scope?: OwnedScope | null;
    }) => void): () => void;
    subscribeNavigation?(listener: (notice: ToolNavigationNotice) => void): () => void;
    business?: {
        invoke<K extends keyof BusinessOperationMap>(method: K, args: BusinessOperationMap[K]['args']): Promise<BusinessOperationMap[K]['result']>;
    };
    embedded?: {
        acquire(target: 'personal_profile' | 'model_insights'): Promise<EmbeddedLease>;
        release(lease: string): Promise<void>;
        setTheme(lease: string, theme: EmbeddedTheme): Promise<void>;
        subscribeInvalid?(listener: (lease: string) => void): () => void;
    };
}
/** Read the already injected account preload.
 * @returns Current desktop preload, or undefined outside its supported environment. */
export declare function accountHost(): AccountHost | undefined;
/** Project only the formally declared public business operations.
 * @param host - Fixed desktop preload.
 * @returns Public method adapter whose unavailable calls reject explicitly. */
export declare function businessApi(host: AccountHost | undefined): StudyBuddyBusinessApi;
//# sourceMappingURL=business-api.d.ts.map